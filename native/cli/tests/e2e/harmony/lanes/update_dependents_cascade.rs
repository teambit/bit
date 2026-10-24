//! `e2e/harmony/lanes/update-dependents-cascade.e2e.ts`.

use crate::helper::{Helper, parse};

/// - `local snap cascades updateDependents on the lane › comp2 (B) enters lane.updateDependents`
/// - `local snap cascades updateDependents on the lane › comp1 (A) on the lane should be re-snapped with its comp2 dep pointing at the new updateDependent`
/// - `local snap cascades updateDependents on the lane › comp1 stays in lane.components (it was never a hidden updateDependent)`
/// - `local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › both comp1 and comp2 are cascaded to new hashes in updateDependents`
/// - `local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › cascaded comp2 depends on the new comp3 head`
/// - `local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › cascaded comp1 depends on the cascaded comp2 (not the old updDep comp2)`
/// - `local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › the cascaded components should NOT appear in the workspace bitmap (still hidden updateDependents)`
/// - `local snap cascades updateDependents on the lane › scenario 6: promote-on-import — importing an updateDependent then snapping it moves it to lane.components › comp2 should be in lane.components with a fresh snap`
/// - `local snap cascades updateDependents on the lane › scenario 6: promote-on-import — importing an updateDependent then snapping it moves it to lane.components › comp2 should NOT appear in lane.updateDependents (the stale entry must be cleared)`
/// - `local snap cascades updateDependents on the lane › scenario 3: divergence — two users snap the same lane concurrently › user A's export should advance the comp2 entry in updateDependents past the initial state`
/// - `local snap cascades updateDependents on the lane › scenario 3: divergence — two users snap the same lane concurrently › user B's export should be rejected because the lane is diverged`
#[test]
fn scenarios_3_4_5_6_local_snap_cascades_update_dependents() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp3 --skip-auto-snap --unmodified --skip-tests");
    helper.native("export");
    let remote = helper.scopes.remote.clone();

    // Seed both comp2 and comp1 into updateDependents (Scenario 5)
    helper.seed_hidden_update_dependent(&format!("{remote}/comp2"), &format!("{remote}/dev"));
    let lane_seed2 = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let comp2_initial = lane_seed2["updateDependents"][0]
        .as_str()
        .unwrap()
        .split('@')
        .nth(1)
        .unwrap()
        .to_owned();

    helper.seed_hidden_update_dependent(&format!("{remote}/comp1"), &format!("{remote}/dev"));
    let lane_seed1 = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let comp1_initial = lane_seed1["updateDependents"]
        .as_array()
        .unwrap()
        .iter()
        .find_map(|item| {
            item.as_str()
                .filter(|text| text.contains("comp1"))
        })
        .unwrap()
        .split('@')
        .nth(1)
        .unwrap()
        .to_owned();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    helper.native(&format!("import {remote}/comp3 -x"));
    let user_b_ws = helper.clone_workspace();

    helper.output_file(&format!("{remote}/comp3/index.js"), "module.exports = () => 'comp3-v2';");
    helper.run("snap --skip-tests");
    helper.native("export");
    let comp3_head_after = helper.get_head_from_lane("dev", "comp3");

    let lane = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let upd_deps = lane["updateDependents"].as_array().unwrap();
    assert_eq!(upd_deps.len(), 2);
    let comp2_new_ref = upd_deps
        .iter()
        .find_map(|item| {
            item.as_str()
                .filter(|text| text.contains("comp2"))
        })
        .unwrap();
    let comp1_new_ref = upd_deps
        .iter()
        .find_map(|item| {
            item.as_str()
                .filter(|text| text.contains("comp1"))
        })
        .unwrap();
    let comp2_new_hash = comp2_new_ref.split('@').nth(1).unwrap();
    let comp1_new_hash = comp1_new_ref.split('@').nth(1).unwrap();
    assert_ne!(comp2_new_hash, comp2_initial);
    assert_ne!(comp1_new_hash, comp1_initial);

    let comp2_obj = parse(
        &Helper::cmd_in(
            &helper.scopes.remote_path,
            &format!("cat-component {comp2_new_ref} --json"),
        )
        .stdout,
    );
    assert_eq!(
        comp2_obj["dependencies"][0]["id"]["version"].as_str(),
        Some(comp3_head_after.as_str()),
    );

    let comp1_obj = parse(
        &Helper::cmd_in(
            &helper.scopes.remote_path,
            &format!("cat-component {comp1_new_ref} --json"),
        )
        .stdout,
    );
    assert_eq!(comp1_obj["dependencies"][0]["id"]["version"].as_str(), Some(comp2_new_hash));

    let bitmap = helper.read_bit_map();
    assert!(bitmap.get("comp1").is_none());
    assert!(bitmap.get("comp2").is_none());

    // Scenario 3: User B snaps concurrently and export is rejected because lane diverged
    helper.get_cloned_workspace(&user_b_ws);
    helper.output_file(
        &format!("{remote}/comp3/index.js"),
        "module.exports = () => 'comp3-v2-userB';",
    );
    helper.run("snap --skip-tests");
    let exp_b = helper.native_run("export");
    assert_ne!(exp_b.status.code(), Some(0));
}
