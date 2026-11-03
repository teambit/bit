//! Port of `e2e/harmony/lanes/update-dependents-cascade.e2e.ts` for hidden dependent cascade on snap ([`older`], [`scenarios_3_4_5_6_local_snap_cascades_update_dependents`], [`Helper`]).
//!
//! Covers transitive `updateDependents` cascades, promotion on import, and divergence guards.

/// Older-snapshot hidden dependency cascade regression tests ([`scenarios_3_4_5_6_local_snap_cascades_update_dependents`]).
mod older;

use crate::helper::{Helper, parse};

/// Verifies transitive `updateDependents` cascade, promotion on import, and concurrent export divergence rejection ([`Helper`], [`parse`]).
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
