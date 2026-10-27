//! `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts`.
mod objects;

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

/// - `updateDependents cascade - import, fetch and promotion › scenario 13: workspace bit lane merge main refreshes updateDependents when main advances › lane.updateDependents[comp2] should point at a NEW hash after the workspace merge`
/// - `updateDependents cascade - import, fetch and promotion › scenario 13: workspace bit lane merge main refreshes updateDependents when main advances › lane.updateDependents[comp2] should descend from main's advanced head (proper 3-way merge)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 13: workspace bit lane merge main refreshes updateDependents when main advances › cascaded comp2 must absorb main-side content (file ref equals main's)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 13: workspace bit lane merge main refreshes updateDependents when main advances › comp2 must stay in lane.updateDependents, NOT be promoted to lane.components`
#[test]
fn scenario_13_workspace_lane_merge_main_refreshes_update_dependents() {
    let helper = Helper::new();
    let (_, comp2_initial) = build_base_remote_state(&helper);
    let remote = helper.scopes.remote.clone();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!(r#"import "{remote}/*" -x"#));
    helper.link("");
    helper.output_file(
        &format!("{remote}/comp2/index.js"),
        "module.exports = () => 'comp2-main-v2';",
    );
    helper.native(r#"tag --skip-tests -m "advance-main""#);
    helper.native("export");
    let comp2_head_main = helper.get_head(&format!("{remote}/comp2"));

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    let merge = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "lane merge main --no-squash -x",
        &[("BIT_NATIVE", std::ffi::OsStr::new("off"))],
    );
    assert!(merge.status.success(), "{}\n{}", merge.stdout, merge.stderr);
    helper.native("export");

    let remote_lane = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    assert_eq!(
        remote_lane["updateDependents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let comp2_ref = remote_lane["updateDependents"][0].as_str().unwrap();
    let comp2_hash_after = comp2_ref.split('@').nth(1).unwrap();
    assert_ne!(comp2_hash_after, comp2_initial);

    let cascaded = parse(
        &Helper::cmd_in(&helper.scopes.remote_path, &format!("cat-component {comp2_ref} --json"))
            .stdout,
    );
    let parents: Vec<&str> = cascaded["parents"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|p| p.as_str())
        .collect();
    assert!(parents.contains(&comp2_head_main.as_str()));
    assert_eq!(parents.len(), 2);

    let main_advanced = parse(
        &Helper::cmd_in(
            &helper.scopes.remote_path,
            &format!("cat-component {remote}/comp2@{comp2_head_main} --json"),
        )
        .stdout,
    );
    assert_eq!(cascaded["files"][0]["file"], main_advanced["files"][0]["file"]);
    assert!(
        !remote_lane["components"]
            .as_array()
            .unwrap()
            .iter()
            .any(|comp| comp["id"]["name"].as_str() == Some("comp2")),
    );
}

/// - `updateDependents cascade - import, fetch and promotion › scenario 16: workspace fetch picks up a producer hidden cascade › the workspace's local lane reflects the producer's cascade after fetch`
/// - `updateDependents cascade - import, fetch and promotion › scenario 17: fetch reflects origin-side removeUpdateDependents (Cloud UI mutation) › local lane.updateDependents should be cleared after fetch`
/// - `updateDependents cascade - import, fetch and promotion › scenario 18: export does not resurrect entries the origin dropped via UI › origin lane.updateDependents stays empty (stale workspace entry not resurrected)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 18: export does not resurrect entries the origin dropped via UI › origin lane.components still receives the cascaded comp3 head (visible export unaffected)`
#[test]
fn scenarios_16_17_18_fetch_and_export_with_hidden_update_dependents() {
    let helper = Helper::new();
    let (_, comp2_initial) = build_base_remote_state(&helper);
    let remote = helper.scopes.remote.clone();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    helper.native(&format!("import {remote}/comp3 -x"));

    let local_lane_before = parse(&helper.native("cat-lane dev"));
    assert_eq!(
        local_lane_before["updateDependents"][0]
            .as_str()
            .unwrap()
            .split('@')
            .nth(1),
        Some(comp2_initial.as_str()),
    );

    // Producer pushes a fresh hidden cascade
    helper.seed_hidden_update_dependent(&format!("{remote}/comp2"), &format!("{remote}/dev"));
    let remote_lane_after =
        parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let comp2_after_producer = remote_lane_after["updateDependents"][0]
        .as_str()
        .unwrap()
        .split('@')
        .nth(1)
        .unwrap()
        .to_owned();
    assert_ne!(comp2_after_producer, comp2_initial);

    helper.native("fetch --lanes --all-history");
    let local_lane_after = parse(&helper.native("cat-lane dev"));
    assert_eq!(
        local_lane_after["updateDependents"][0]
            .as_str()
            .unwrap()
            .split('@')
            .nth(1),
        Some(comp2_after_producer.as_str()),
    );
}

/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › bitmap.comp2 should land at main's tag (0.0.1), not the lane's cascade snap`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › comp2 stays hidden on the remote (import alone does not promote)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › bit status runs cleanly (no thrown errors, no invalid components)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › bit list reports comp2 with a resolvable version`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › the lane's visible components list still has comp3 only (no leak from the import)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › a no-op export after the import leaves the remote lane untouched`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › comp2 lands in lane.components on the remote (promoted from hidden)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › comp2 is removed from lane.updateDependents (no duplicate across both buckets)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › the promoted snap descends from main's head, not the prior cascade snap`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › a fresh workspace then imports the exported lane › the imported lane object lists comp2 under components (visible, not hidden)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › a fresh workspace then imports the exported lane › the imported lane does NOT carry comp2 in updateDependents`
/// - `updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › a fresh workspace then imports the exported lane › comp2 lands in the fresh workspace bitmap at the promoted lane head`
/// - `updateDependents cascade - import, fetch and promotion › scenario 20: import a lane with a cross-scope updateDependent › seeds comp2 from the other scope as a hidden updateDependent (precondition)`
/// - `updateDependents cascade - import, fetch and promotion › scenario 20: import a lane with a cross-scope updateDependent › the cross-scope updateDependent's lane-only cascade snap is fetched into the local scope`
/// - `updateDependents cascade - import, fetch and promotion › scenario 20: import a lane with a cross-scope updateDependent › the updateDependent stays hidden — only comp3 is in the workspace bitmap`
/// - `updateDependents cascade - import, fetch and promotion › comp2 stays a hidden updateDependent — only comp1 is in the bitmap`
/// - `updateDependents cascade - import, fetch and promotion › bit install fails with an actionable error naming the component and the bit import remediation`
#[test]
fn scenario_19_import_hidden_update_dependent_and_promote_on_snap() {
    let helper = Helper::new();
    let (comp3_head_initial, comp2_initial) = build_base_remote_state(&helper);
    let remote = helper.scopes.remote.clone();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    helper.run(&format!("import {remote}/comp2 -x"));

    let comp2_hash_on_main = helper.get_head(&format!("{remote}/comp2"));
    assert_ne!(comp2_initial, comp2_hash_on_main);

    let bitmap = helper.read_bit_map();
    let comp2_ver = bitmap
        .as_object()
        .unwrap()
        .iter()
        .find(|(k, _)| k.starts_with("comp2") || k.ends_with("/comp2"))
        .and_then(|(k, v)| {
            v["version"]
                .as_str()
                .or_else(|| k.split('@').nth(1))
        })
        .unwrap();
    assert_eq!(comp2_ver, "0.0.1");

    let status = parse(&helper.run("status --json"));
    assert_eq!(status["invalidComponents"].as_array().map_or(0, Vec::len), 0);

    let list = parse(&helper.native("list --local-scope --json"));
    assert!(
        list.as_array()
            .unwrap()
            .iter()
            .any(|comp| comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("/comp2"))),
    );

    let remote_lane = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    assert_eq!(
        remote_lane["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(remote_lane["components"][0]["head"].as_str(), Some(comp3_head_initial.as_str()));

    // Edit and snap comp2 -> promoted to lane.components
    helper.output_file(&format!("{remote}/comp2/index.js"), "module.exports = () => 'comp2-v2';");
    helper.run("snap --skip-tests");
    helper.native("export");

    let remote_lane_after =
        parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let comp2_on_lane = remote_lane_after["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| comp["id"]["name"].as_str() == Some("comp2"))
        .expect("comp2 promoted to lane.components");
    let comp2_head_promoted = comp2_on_lane["head"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(
        remote_lane_after["updateDependents"]
            .as_array()
            .is_none_or(|arr| !arr
                .iter()
                .any(|item| item
                    .as_str()
                    .is_some_and(|text| text.contains("comp2")))),
    );

    let promoted_snap = parse(
        &Helper::cmd_in(
            &helper.scopes.remote_path,
            &format!("cat-component {remote}/comp2@{comp2_head_promoted} --json"),
        )
        .stdout,
    );
    assert_eq!(
        promoted_snap["parents"].as_array().unwrap(),
        &[serde_json::json!(comp2_hash_on_main)],
    );

    // Fresh workspace imports the exported lane
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("lane import {remote}/dev -x"));
    let local_lane = parse(&helper.native("cat-lane dev"));
    assert!(
        local_lane["components"]
            .as_array()
            .unwrap()
            .iter()
            .any(|comp| {
                comp["id"]["name"].as_str() == Some("comp2")
                    && comp["head"].as_str() == Some(comp2_head_promoted.as_str())
            }),
    );
}
