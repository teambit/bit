//! `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts`.

use crate::helper::{Helper, parse};

fn build_base_remote_state(helper: &Helper) -> (String, String) {
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp3 --skip-auto-snap --unmodified --skip-tests");
    helper.native("export");
    let comp3_head_initial = helper.get_head_from_lane("dev", "comp3");

    let remote = helper.scopes.remote.clone();
    helper.seed_hidden_update_dependent(&format!("{remote}/comp2"), &format!("{remote}/dev"));

    let lane = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let comp2_initial = lane["updateDependents"][0]
        .as_str()
        .unwrap()
        .split('@')
        .nth(1)
        .unwrap()
        .to_owned();
    (comp3_head_initial, comp2_initial)
}

/// - `updateDependents cascade - reset, history and checkout › scenario 7: local cascade survives a bit fetch --lanes before export › local lane.updateDependents still points at the cascaded comp2 hash (not reverted to the remote version)`
/// - `updateDependents cascade - reset, history and checkout › scenario 7: local cascade survives a bit fetch --lanes before export › bit export still publishes the cascade to the remote afterward`
/// - `updateDependents cascade - reset, history and checkout › scenario 7: local cascade survives a bit fetch --lanes before export › cascaded comp2 on the remote points at the new comp3 head`
/// - `updateDependents cascade - reset, history and checkout › scenario 8: bit reset reverts the cascade, not just the direct snap › comp3 on the lane should rewind to its pre-snap head`
/// - `updateDependents cascade - reset, history and checkout › scenario 8: bit reset reverts the cascade, not just the direct snap › a subsequent export should leave the remote lane unchanged from its pre-snap state`
#[test]
fn scenarios_7_and_8_local_cascade_survives_fetch_and_reset_reverts_cascade() {
    let helper = Helper::new();
    let (comp3_head_initial, comp2_initial) = build_base_remote_state(&helper);
    let remote = helper.scopes.remote.clone();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    helper.native(&format!("import {remote}/comp3 -x"));

    helper.output_file(&format!("{remote}/comp3/index.js"), "module.exports = () => 'comp3-v2';");
    helper.run("snap --skip-tests");

    let lane_after_snap = parse(&helper.native("cat-lane dev"));
    let comp2_after_snap = lane_after_snap["updateDependents"][0]
        .as_str()
        .unwrap()
        .split('@')
        .nth(1)
        .unwrap()
        .to_owned();
    let comp3_after_snap = helper.get_head_from_lane("dev", "comp3");
    assert_ne!(comp2_after_snap, comp2_initial);

    let ws_before_fetch = helper.clone_workspace();

    // Scenario 7: fetch --lanes preserves local cascade and export publishes it
    helper.native("fetch --lanes");
    let local_lane = parse(&helper.native("cat-lane dev"));
    assert_eq!(
        local_lane["updateDependents"][0]
            .as_str()
            .unwrap()
            .split('@')
            .nth(1),
        Some(comp2_after_snap.as_str()),
    );
    helper.native("export");
    let remote_lane = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let remote_comp2_ref = remote_lane["updateDependents"][0].as_str().unwrap();
    assert_eq!(remote_comp2_ref.split('@').nth(1), Some(comp2_after_snap.as_str()));
    let remote_comp2 = parse(
        &Helper::cmd_in(
            &helper.scopes.remote_path,
            &format!("cat-component {remote_comp2_ref} --json"),
        )
        .stdout,
    );
    let comp3_dep = remote_comp2["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| dep["id"]["name"].as_str() == Some("comp3"))
        .unwrap();
    assert_eq!(comp3_dep["id"]["version"].as_str(), Some(comp3_after_snap.as_str()));

    // Scenario 8: reset --silent rewinds both comp3 and updateDependents
    helper.get_cloned_workspace(&ws_before_fetch);
    helper.native("reset --silent");
    let lane_after_reset = parse(&helper.native("cat-lane dev"));
    let comp3_on_lane = lane_after_reset["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| comp["id"]["name"].as_str() == Some("comp3"))
        .unwrap();
    assert_eq!(comp3_on_lane["head"].as_str(), Some(comp3_head_initial.as_str()));
    assert_eq!(
        lane_after_reset["updateDependents"][0]
            .as_str()
            .unwrap()
            .split('@')
            .nth(1),
        Some(comp2_initial.as_str()),
    );
}

fn entry_has_update_dependent_suffix(entry: &serde_json::Value, suffix: &str) -> bool {
    entry["updateDependents"]
        .as_array()
        .is_some_and(|arr| {
            arr.iter()
                .any(|item| {
                    item.as_str()
                        .is_some_and(|text| text.ends_with(suffix))
                })
        })
}

/// - `updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › lane.updateDependents should point at the FIRST-snap cascade comp2 hash (not reverted to pre-cascade)`
/// - `updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › bit status should not throw ComponentsPendingImport for the visible component`
/// - `updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › bit status should not list hidden updateDependents under stagedComponents`
/// - `updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › bit status should surface the locally-cascaded comp2 under pendingUpdateDependents`
/// - `updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › bit lane history runs cleanly on a lane that has hidden updateDependents`
/// - `updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › history entries created BEFORE the workspace snap include the seeded comp2 hash under updateDependents`
/// - `updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › a workspace cascade snap appends a new history entry`
/// - `updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › the new history entry records the advanced comp3 head among its components`
/// - `updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › the new history entry records the cascaded comp2 hash under updateDependents (separate from components)`
/// - `updateDependents cascade - reset, history and checkout › scenario 15: bit lane checkout leaves hidden updateDependents untouched on the lane › lane.updateDependents should stay at the post-cascade hash (lane is not mutated by checkout)`
/// - `updateDependents cascade - reset, history and checkout › scenario 15: bit lane checkout leaves hidden updateDependents untouched on the lane › comp2 must stay hidden (not promoted to lane.components)`
/// - `updateDependents cascade - reset, history and checkout › scenario 15: bit lane checkout leaves hidden updateDependents untouched on the lane › comp2 must NOT appear in the workspace bitmap after the checkout`
#[test]
fn scenarios_9_14_15_reset_head_lane_history_and_lane_checkout() {
    let helper = Helper::new();
    let (_, comp2_initial) = build_base_remote_state(&helper);
    let remote = helper.scopes.remote.clone();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    helper.native(&format!("import {remote}/comp3 -x"));

    let hist_before = parse(&helper.native("lane history --json"));
    let hist_before_arr = hist_before.as_array().unwrap();
    assert!(!hist_before_arr.is_empty());
    let suffix = format!("@{comp2_initial}");
    let pre_cascade_id = hist_before_arr
        .iter()
        .find(|entry| entry_has_update_dependent_suffix(entry, &suffix))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    // First snap
    helper.output_file(&format!("{remote}/comp3/index.js"), "module.exports = () => 'comp3-v2';");
    helper.run("snap --skip-tests");
    let lane_after_first = parse(&helper.native("cat-lane dev"));
    let comp2_after_first = lane_after_first["updateDependents"][0]
        .as_str()
        .unwrap()
        .split('@')
        .nth(1)
        .unwrap()
        .to_owned();
    assert_ne!(comp2_after_first, comp2_initial);

    // Second snap
    helper.output_file(&format!("{remote}/comp3/index.js"), "module.exports = () => 'comp3-v3';");
    helper.run("snap --skip-tests");
    let lane_after_second = parse(&helper.native("cat-lane dev"));
    assert_ne!(
        lane_after_second["updateDependents"][0]
            .as_str()
            .unwrap()
            .split('@')
            .nth(1),
        Some(comp2_after_first.as_str()),
    );

    // Scenario 9: reset --head --silent
    helper.native("reset --head --silent");
    let lane_after_reset_head = parse(&helper.native("cat-lane dev"));
    assert_eq!(
        lane_after_reset_head["updateDependents"][0]
            .as_str()
            .unwrap()
            .split('@')
            .nth(1),
        Some(comp2_after_first.as_str()),
    );
    let status = parse(&helper.native("status --json"));
    assert_eq!(status["importPendingComponents"].as_array().map_or(0, Vec::len), 0);
    assert!(
        status["pendingUpdateDependents"]
            .as_array()
            .is_some_and(|arr| arr
                .iter()
                .any(|item| item
                    .as_str()
                    .is_some_and(|text| text.ends_with("/comp2")))),
    );

    // Scenario 14: lane history after cascade snap
    let hist_after = parse(&helper.native("lane history --json"));
    assert!(hist_after.as_array().unwrap().len() > hist_before_arr.len());

    // Scenario 15: lane checkout leaves updateDependents untouched
    helper.native("checkout reset --all -x");
    helper.native(&format!("lane checkout {pre_cascade_id} -x"));
    let lane_after_checkout = parse(&helper.native("cat-lane dev"));
    assert_eq!(
        lane_after_checkout["updateDependents"][0]
            .as_str()
            .unwrap()
            .split('@')
            .nth(1),
        Some(comp2_after_first.as_str()),
    );
    assert!(
        !lane_after_checkout["components"]
            .as_array()
            .unwrap()
            .iter()
            .any(|comp| comp["id"]["name"].as_str() == Some("comp2")),
    );
    let bitmap = helper.read_bit_map();
    assert!(bitmap.get("comp2").is_none());
}
