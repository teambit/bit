//! `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn single_scope_two_diverged_lanes_squash_on_merge() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("tag --skip-tests");
    let common_ancestor = helper.get_head("comp1");
    helper.native("export");

    helper.native("lane create lane-a");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let head_on_lane_a = helper.get_head_from_lane("lane-a", "comp1");
    helper.native("export");
    let lane_a_workspace = helper.clone_workspace();

    helper.native("switch main -x");
    helper.native("lane create lane-b");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.native("export");

    helper.get_cloned_workspace(&lane_a_workspace);
    helper.run("import --objects");
    helper.native(&format!(
        "lane merge {}/lane-b --squash --auto-merge-resolve theirs -x",
        helper.scopes.remote,
    ));
    let merge_snap = helper.get_head_from_lane("lane-a", "comp1");

    // 1. merge snap should have a single parent pointing to lane-a head
    let snap = parse(&helper.cat_component(&format!("comp1@{merge_snap}")));
    assert_eq!(snap["parents"], serde_json::json!([head_on_lane_a]));

    // 2. merge snap should record squash metadata with the dropped lane-b head
    assert!(
        snap["squashed"]["previousParents"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v.as_str())
            .any(|parent| parent == head_on_lane_b.as_str()),
    );

    // 3. bit log should show a clean history without lane-b intermediate snaps
    let log = parse(&helper.native("log comp1 --json"));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(hashes.contains(&common_ancestor.as_str()));
    assert!(hashes.contains(&head_on_lane_a.as_str()));
    assert!(hashes.contains(&merge_snap.as_str()));
    assert!(!hashes.contains(&head_on_lane_b.as_str()));
}

#[test]
fn multi_scope_lane_a_on_scope_a_lane_b_on_scope_b_diverged_squash() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_b_env = helper.create_new_remote_scope();
    let scope_b = scope_b_env.scope_name;
    let scope_b_path = scope_b_env.scope_path;
    helper.add_remote_scope_with(&scope_b_path);

    helper.populate_components(1, false, "");
    helper.native("tag --skip-tests");
    helper.native("export");

    helper.native("lane create lane-a");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let head_on_lane_a = helper.get_head_from_lane("lane-a", "comp1");
    helper.native("export");
    let lane_a_workspace = helper.clone_workspace();

    helper.native("switch main -x");
    helper.native(&format!("lane create lane-b --scope {scope_b} --fork-lane-new-scope"));
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.run("export --fork-lane-new-scope");

    helper.get_cloned_workspace(&lane_a_workspace);
    helper.run("import --objects");
    helper.native(&format!("lane merge {scope_b}/lane-b --squash --auto-merge-resolve theirs -x"));
    let merge_snap = helper.get_head_from_lane("lane-a", "comp1");
    helper.native("export");
    let scope_a_after_export = helper.clone_workspace();

    // 1. merge snap should have a single parent pointing to lane-a head
    let snap = parse(&helper.cat_component(&format!("comp1@{merge_snap}")));
    assert_eq!(snap["parents"], serde_json::json!([head_on_lane_a]));

    // 2. merge snap squash metadata should record the dropped lane-b head
    assert!(
        snap["squashed"]["previousParents"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v.as_str())
            .any(|parent| parent == head_on_lane_b.as_str()),
    );

    // 3. scope-a should NOT contain lane-b intermediate snaps after export
    let out = Helper::cmd_in(&helper.scopes.remote_path, &format!("cat-object {head_on_lane_b}"));
    assert!(!out.status.success());

    // 4. scope-a should contain the merge snap
    let out = Helper::cmd_in(&helper.scopes.remote_path, &format!("cat-object {merge_snap}"));
    assert!(out.status.success(), "{out:?}");

    // 5. scope-b should still contain lane-b intermediate snaps
    let out = Helper::cmd_in(&scope_b_path, &format!("cat-object {head_on_lane_b}"));
    assert!(out.status.success(), "{out:?}");

    // fresh consumer imports lane-a from scope-a
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&scope_b_path);
    helper.native(&format!("lane import {}/lane-a -x", helper.scopes.remote));

    // 6. bit log should show the merge snap and lane-a chain, not lane-b intermediates
    let log = parse(&helper.run("log comp1 --json"));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(hashes.contains(&merge_snap.as_str()));
    assert!(hashes.contains(&head_on_lane_a.as_str()));
    assert!(!hashes.contains(&head_on_lane_b.as_str()));

    // 7. bit status should not throw
    let status = helper.native_run("status");
    assert!(status.status.success(), "{status:?}");

    // re-merge of lane-b after it advances with new snaps
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&scope_b_path);
    helper.native(&format!("lane import {scope_b}/lane-b -x"));
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let head_on_lane_b_after = helper.get_head_from_lane(&format!("{scope_b}/lane-b"), "comp1");
    helper.native("export");

    helper.get_cloned_workspace(&scope_a_after_export);
    helper.run("import --objects");
    helper.native(&format!("lane merge {scope_b}/lane-b --squash --auto-merge-resolve theirs -x"));
    let second_merge_snap = helper.get_head_from_lane("lane-a", "comp1");

    // 8. second merge snap should have a single parent pointing to the previous merge snap
    let snap = parse(&helper.cat_component(&format!("comp1@{second_merge_snap}")));
    assert_eq!(snap["parents"], serde_json::json!([merge_snap]));

    // 9. second merge snap should record the new dropped lane-b head (B5), not B3
    let prev_parents = snap["squashed"]["previousParents"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.as_str())
        .collect::<Vec<_>>();
    assert!(prev_parents.contains(&head_on_lane_b_after.as_str()));
    assert!(!prev_parents.contains(&head_on_lane_b.as_str()));

    // 10. bit log after re-merge should show two merge snaps in the chain, no lane-b intermediates
    let log = parse(&helper.native("log comp1 --json"));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(hashes.contains(&merge_snap.as_str()));
    assert!(hashes.contains(&second_merge_snap.as_str()));
    assert!(!hashes.contains(&head_on_lane_b.as_str()));
    assert!(!hashes.contains(&head_on_lane_b_after.as_str()));

    // 11. re-merge should export to scope-a without errors
    let export = helper.native_run("export");
    assert!(export.status.success(), "{export:?}");
}

#[test]
fn lane_into_main_diverged_squash() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("tag --skip-tests");
    let common_ancestor = helper.get_head("comp1");
    helper.native("export");

    helper.native("lane create dev");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let head_on_lane = helper.get_head_from_lane("dev", "comp1");
    helper.native("export");

    helper.native("switch main -x");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let head_on_main = helper.get_head("comp1");
    helper.native("export");

    helper.native(&format!(
        "lane merge {}/dev --squash --auto-merge-resolve theirs -x",
        helper.scopes.remote,
    ));
    let merge_snap = helper.get_head("comp1");

    // 1. merge snap on main should have a single parent pointing to the previous main head
    let snap = parse(&helper.cat_component(&format!("comp1@{merge_snap}")));
    assert_eq!(snap["parents"], serde_json::json!([head_on_main]));

    // 2. merge snap should record squash metadata with the dropped lane head
    assert!(
        snap["squashed"]["previousParents"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v.as_str())
            .any(|parent| parent == head_on_lane.as_str()),
    );

    // 3. bit log on main should show the main chain + merge snap, not the lane intermediates
    let log = parse(&helper.native("log comp1 --json"));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(hashes.contains(&common_ancestor.as_str()));
    assert!(hashes.contains(&head_on_main.as_str()));
    assert!(hashes.contains(&merge_snap.as_str()));
    assert!(!hashes.contains(&head_on_lane.as_str()));

    // 4. exporting main after the merge should succeed
    let export = helper.native_run("export");
    assert!(export.status.success(), "{export:?}");
}

#[test]
fn lane_into_main_cross_scope_diverged_squash_with_fresh_consumer() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_b_env = helper.create_new_remote_scope();
    let scope_b = scope_b_env.scope_name;
    let scope_b_path = scope_b_env.scope_path;
    helper.add_remote_scope_with(&scope_b_path);

    let comp_full_id = format!("{}/comp1", helper.scopes.remote);
    helper.populate_components(1, false, "");
    helper.native("tag --skip-tests");
    let common_ancestor_hash = helper.get_head("comp1");
    helper.native("export");

    helper.native(&format!("lane create dev --scope {scope_b} --fork-lane-new-scope"));
    helper.native("snap --skip-tests --unmodified");
    let lane_snap1 = helper.get_head_from_lane("dev", "comp1");
    helper.native("snap --skip-tests --unmodified");
    let lane_snap2 = helper.get_head_from_lane("dev", "comp1");
    helper.native("snap --skip-tests --unmodified");
    let lane_head = helper.get_head_from_lane("dev", "comp1");
    helper.run("export --fork-lane-new-scope");

    helper.native("switch main -x");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    let main_head2 = helper.get_head("comp1");
    helper.native("export");

    helper.run(&format!("lane merge {scope_b}/dev --squash --auto-merge-resolve theirs -x"));
    let merge_head = helper.get_head("comp1");
    helper.native("export");

    // 1. merge snap on main should have a single parent pointing to the previous main head
    let snap = parse(&helper.cat_component(&format!("comp1@{merge_head}")));
    assert_eq!(snap["parents"], serde_json::json!([main_head2]));

    // 2. merge snap should record squash metadata pointing at the dropped lane head (L3)
    assert!(
        snap["squashed"]["previousParents"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v.as_str())
            .any(|parent| parent == lane_head.as_str()),
    );

    // fresh consumer imports comp1 from scope-a (no scope-b in remotes)
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/comp1 -x", helper.scopes.remote));

    // 3. bit status should not throw
    let status = helper.native_run("status");
    assert!(status.status.success(), "{status:?}");

    // 4. bit log should show common ancestor + main chain + merge snap
    let log = parse(&helper.run(&format!("log {comp_full_id} --json")));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(hashes.contains(&merge_head.as_str()));
    assert!(hashes.contains(&main_head2.as_str()));
    assert!(hashes.contains(&common_ancestor_hash.as_str()));

    // 5. bit log should NOT include the dev lane intermediates (they live only on scope-b)
    assert!(!hashes.contains(&lane_snap1.as_str()));
    assert!(!hashes.contains(&lane_snap2.as_str()));
    assert!(!hashes.contains(&lane_head.as_str()));
}

#[test]
fn sanity_squash_on_non_diverged_fast_forward_lane_to_lane_merge() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("tag --skip-tests");
    let common_head = helper.get_head("comp1");
    helper.native("export");

    helper.native("lane create lane-a");
    helper.native("export");

    helper.native("switch main -x");
    helper.native("lane create lane-b");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("snap --skip-tests --unmodified");
    helper.native("export");

    helper.native("switch lane-a -x");
    helper.native(&format!(
        "lane merge {}/lane-b --squash --auto-merge-resolve theirs -x",
        helper.scopes.remote,
    ));
    let merge_snap = helper.get_head_from_lane("lane-a", "comp1");

    // 1. squashed snap on lane-a should have a single parent pointing to the common head
    let snap = parse(&helper.cat_component(&format!("comp1@{merge_snap}")));
    assert_eq!(snap["parents"], serde_json::json!([common_head]));

    // 2. bit log should not throw
    let log = helper.native_run("log comp1");
    assert!(log.status.success(), "{log:?}");
}
