//! `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn multiple_scopes_when_a_component_in_the_origin_is_different_than_on_the_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let origin_env = helper.create_new_remote_scope();
    let origin_remote = origin_env.scope_name;
    let origin_path = origin_env.scope_path;
    helper.add_remote_scope_with(&origin_path);

    helper.create_lane("dev", "");
    helper.add_default_scope(&origin_remote);
    helper.populate_components(1, false, "on-lane");
    helper.snap_all_components_without_build("");
    let lane_scope_head = helper.get_head_from_lane("dev", "comp1");
    helper.export("");
    let after_lane_export = helper.clone_workspace();
    let remote_scope_after_export = helper.clone_remote_scope();

    helper.re_init_workspace();
    helper.add_remote_scope_with(&origin_path);
    helper.add_default_scope(&origin_remote);
    helper.populate_components(1, false, "on-origin");
    helper.tag_all_without_build("");
    let main_head = helper.get_head("comp1");
    helper.export("");

    helper.get_cloned_workspace(&after_lane_export);
    helper.import_and_get_objects();

    // 1. bit status should have the component as pendingUpdatesFromMain with an noCommonSnap error
    let status = parse(&helper.run_cmd("status --json --lanes"));
    assert_eq!(
        status["pendingUpdatesFromMain"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        status["pendingUpdatesFromMain"][0]["divergeData"]["err"]["name"].as_str().unwrap(),
        "NoCommonSnap",
    );

    // 2. bit lane merge without --resolve-unrelated flag: should throw
    let err = helper.try_cmd("lane merge main -x");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("don't have any snap in common"));

    // bit lane merge with --resolve-unrelated
    let merge_output = helper.merge_lane("main", "--resolve-unrelated -x");

    // 3. should merge successfully
    assert!(merge_output.contains("successfully merged"), "{merge_output}");
    assert!(!merge_output.contains("snap error"), "{merge_output}");

    // 4. bit status should show the component as staged and not everywhere else
    helper.expect_status_to_be_clean_except(&["stagedComponents"]);

    // 5. should not change the file content because the default merge-strategy is "ours"
    let file = helper.read_file("comp1/index.js");
    assert!(file.contains("on-lane"));
    assert!(!file.contains("on-origin"));

    // 6. head on lane should point to the main head to preserve the history of the origin
    let lane_head = helper.get_head_from_lane("dev", "comp1");
    let cat_obj = parse(&helper.cat_component(&format!("comp1@{lane_head}")));
    assert_eq!(cat_obj["parents"][0].as_str().unwrap(), main_head);

    // 7. version object should hold a reference for the abandoned component
    assert_eq!(cat_obj["unrelated"]["head"].as_str().unwrap(), lane_scope_head);

    // 8. should export the component successfully
    let export = helper.try_cmd("export");
    assert!(export.status.success(), "{export:?}");

    // bit lane merge with --resolve-unrelated and --no-auto-snap
    helper.get_cloned_remote_scope(&remote_scope_after_export);
    helper.get_cloned_workspace(&after_lane_export);
    helper.import_and_get_objects();
    helper.merge_lane("main", "--resolve-unrelated --no-auto-snap -x");

    // 9. bit status should show the component as during-merge and staged and not everywhere else
    helper.expect_status_to_be_clean_except(&["componentsDuringMergeState", "stagedComponents"]);

    // 10. bit import should not throw
    let import = helper.try_cmd("import");
    assert!(import.status.success(), "{import:?}");

    // snapping the component
    helper.snap_all_components_without_build("");

    // 11. head on lane should point to the main head to preserve the history of the origin
    let lane_head = helper.get_head_from_lane("dev", "comp1");
    let cat_obj = parse(&helper.cat_component(&format!("comp1@{lane_head}")));
    assert_eq!(cat_obj["parents"][0].as_str().unwrap(), main_head);

    // 12. version object should hold a reference for the abandoned component
    assert_eq!(cat_obj["unrelated"]["head"].as_str().unwrap(), lane_scope_head);

    // 13. should export the component successfully
    let export = helper.try_cmd("export");
    assert!(export.status.success(), "{export:?}");

    // 14. bit lane merge with --resolve-unrelated and "theirs" merge-strategy
    helper.get_cloned_remote_scope(&remote_scope_after_export);
    helper.get_cloned_workspace(&after_lane_export);
    helper.import_and_get_objects();
    helper.merge_lane("main", "--resolve-unrelated theirs --no-auto-snap -x");
    let file = helper.read_file("comp1/index.js");
    assert!(file.contains("on-origin"));
    assert!(!file.contains("on-lane"));

    // bit lane merge of another lane that was not resolved yet
    helper.get_cloned_remote_scope(&remote_scope_after_export);
    helper.get_cloned_workspace(&after_lane_export);
    helper.create_lane("dev2", &format!("--remote-scope {}", helper.scopes.remote));
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.switch_local_lane("dev", "-x");
    helper.import_and_get_objects();
    let merge_main_out = helper.merge_lane("main", "--resolve-unrelated -x");
    assert!(!merge_main_out.contains("snap error"), "merge main output: {merge_main_out}");
    let lane_head_after_merge = helper.get_head_from_lane("dev", "comp1");
    helper.export("");
    let before_merging_second_lane = helper.clone_workspace();
    let merge_dev2_out = helper.merge_lane("dev2", "--resolve-unrelated -x");
    assert!(!merge_dev2_out.contains("snap error"), "merge dev2 output: {merge_dev2_out}");

    // 15. should keep the local history and not the dev2 history because the current history has been already resolved
    let log = parse(&helper.run_cmd("log comp1 --json"));
    let hashes_in_history: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["hash"].as_str())
        .collect();
    assert!(hashes_in_history.contains(&main_head.as_str()));
    assert!(hashes_in_history.contains(&lane_head_after_merge.as_str()));

    // 16. bit status should not show components as pendingUpdatesFromMain
    let status = helper.status_json();
    assert_eq!(
        status["pendingUpdatesFromMain"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 17. when main got another tag meanwhile: should be able to merge with no errors
    helper.re_init_workspace();
    helper.add_remote_scope_with(&origin_path);
    helper.import_component(&format!("{origin_remote}/comp1"), "-x");
    helper.tag_all_without_build("--unmodified");
    helper.export("");

    helper.get_cloned_workspace(&before_merging_second_lane);
    helper.import_and_get_objects();
    let merge = helper.try_cmd("lane merge dev2 --resolve-unrelated -x");
    assert!(merge.status.success(), "{merge:?}");

    // 18. switching to main and checking out to head: should make the component available and checkout to main version
    helper.get_cloned_remote_scope(&remote_scope_after_export);
    helper.get_cloned_workspace(&after_lane_export);
    helper.switch_local_lane("main", "-x");
    helper.run_cmd("checkout head comp1 -x");
    let list = helper.list_local_scope_parsed("");
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert!(
        arr[0]["localVersion"]
            .as_str()
            .unwrap()
            .starts_with("0.0"),
    );
    assert!(
        arr[0]["currentVersion"]
            .as_str()
            .unwrap()
            .starts_with("0.0"),
    );

    // 19. bit lane merge after soft-removed the unrelated component: should not throw
    helper.get_cloned_remote_scope(&remote_scope_after_export);
    helper.get_cloned_workspace(&after_lane_export);
    helper.import_and_get_objects();
    helper.run_cmd("delete comp1 --silent --lane");
    helper.snap_all_components_without_build("");
    helper.export("");
    let merge = helper.try_cmd("lane merge main -x");
    assert!(merge.status.success(), "{merge:?}");

    // 20. when the resolved unrelated is not a direct parent: bit status should not throw
    helper.get_cloned_remote_scope(&remote_scope_after_export);
    helper.get_cloned_workspace(&after_lane_export);
    helper.import_and_get_objects();
    helper.snap_all_components_without_build("--unmodified");
    helper.snap_all_components_without_build("--unmodified");
    helper.merge_lane("main", "--resolve-unrelated -x");
    let status = helper.try_cmd("status");
    assert!(status.status.success(), "{status:?}");
}

#[test]
fn multiple_scopes_when_a_component_in_the_origin_is_different_than_on_the_lane_and_the_lane_is_forked()
 {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let origin_env = helper.create_new_remote_scope();
    let origin_remote = origin_env.scope_name;
    let origin_path = origin_env.scope_path;
    helper.add_remote_scope_with(&origin_path);

    helper.create_lane("lane-a", "");
    helper.add_default_scope(&origin_remote);
    helper.populate_components(1, false, "on-lane");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&origin_path);
    helper.create_lane("lane-b", "");
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.merge_lane("lane-a", "-x");

    let import = helper.try_cmd("import");
    assert!(import.status.success(), "{import:?}");
}

#[test]
fn merge_unrelated_between_two_lanes_with_resolve_unrelated() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("lane-a", "");
    helper.populate_components(1, false, "lane-a-v1");
    helper.snap_all_components_without_build("");
    helper.populate_components(1, false, "lane-a-v2");
    helper.snap_all_components_without_build("");
    let head_on_lane_a = helper.get_head_from_lane("lane-a", "comp1");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.create_lane("lane-b", "");
    helper.populate_components(1, false, "lane-b-v1");
    helper.snap_all_components_without_build("");
    helper.populate_components(1, false, "lane-b-v2");
    helper.snap_all_components_without_build("");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    let before_merge = helper.clone_workspace();

    // without specifying strategy, which defaults to "ours"
    helper.merge_lane("lane-a", "--resolve-unrelated -x");

    // 1. should resolve by default by ours
    let file = helper.read_file("comp1/index.js");
    assert_eq!(file, "module.exports = () => 'comp1lane-b-v2';");

    // 2. should populate the unrelated property correctly on the Version object
    let ver = parse(&helper.cat_component("comp1@latest"));
    assert_eq!(ver["unrelated"]["head"].as_str().unwrap(), head_on_lane_a);
    assert_eq!(ver["unrelated"]["laneId"]["name"].as_str().unwrap(), "lane-a");

    // 3. should populate the parents according to the current lane
    assert_eq!(ver["parents"], serde_json::json!([head_on_lane_b]));

    // with strategy theirs
    helper.get_cloned_workspace(&before_merge);
    helper.merge_lane("lane-a", "--resolve-unrelated theirs -x");

    // 4. should get the file content according to their
    let file = helper.read_file("comp1/index.js");
    assert_eq!(file, "module.exports = () => 'comp1lane-a-v2';");

    // 5. should populate the unrelated property correctly on the Version object
    let ver = parse(&helper.cat_component("comp1@latest"));
    assert_eq!(ver["unrelated"]["head"].as_str().unwrap(), head_on_lane_b);
    assert_eq!(ver["unrelated"]["laneId"]["name"].as_str().unwrap(), "lane-b");

    // 6. should populate the parents according to the other lane
    assert_eq!(ver["parents"], serde_json::json!([head_on_lane_a]));
}

#[test]
fn merge_lanes_when_local_lane_has_soft_removed_components() {
    // 1. when the other lane is behind: should not bring the removed components
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.create_lane("dev2", "");
    helper.snap_Component_without_build("comp1", "--unmodified");
    helper.export("");
    helper.switch_local_lane("dev", "-x");
    helper.run_cmd("delete comp2 --silent --lane");
    helper.write_file("comp1/index.js", "");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.merge_lane("dev2", "-x");
    let bitmap = helper.read_bit_map();
    assert!(bitmap.get("comp2").is_none());

    // 2. when the other lane is diverge: bit log should not show duplications
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(2, true, "");
    helper2.create_lane("dev", "");
    helper2.snap_all_components_without_build("");
    helper2.export("");
    helper2.create_lane("dev2", "");
    helper2.snap_all_components_without_build("--unmodified");
    helper2.export("");
    helper2.switch_local_lane("dev", "-x");
    helper2.run_cmd("delete comp2 --silent --lane");
    helper2.write_file("comp1/index.js", "");
    helper2.snap_all_components_without_build("");
    helper2.export("");
    helper2.merge_lane("dev2", "-x");

    let log = parse(&helper2.run_cmd("log comp2 --json"));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    let unique: std::collections::HashSet<&&str> = hashes.iter().collect();
    assert_eq!(hashes.len(), unique.len());
}
