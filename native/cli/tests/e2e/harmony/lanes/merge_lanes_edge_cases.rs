//! `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn merge_a_diverged_lane_into_main_with_tag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.switch_local_lane("main", "-x");
    helper.tag_all_without_build("--unmodified");
    helper.merge_lane("dev", "--no-squash --tag -x");

    // 1. should merge-tag instead of merge-snap
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str().unwrap(), "0.0.3");

    // 2. expect head to have two parents
    let cat = parse(&helper.cat_component("comp1@latest"));
    assert_eq!(cat["parents"].as_array().unwrap().len(), 2);
}

#[test]
fn auto_snap_during_merge_when_the_snap_is_failing_and_merge_to_empty_lane() {
    // 1. auto-snap during merge when the snap is failing: should not change the .bitmap with the failed-snap version
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.switch_local_lane("main", "-x");
    helper.tag_all_without_build("--unmodified");
    helper.run_cmd("deps set comp1 non-exist-pkg@123.123.123");
    let _ = helper.try_cmd("lane merge dev --no-squash --ignore-config-changes --build");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str().unwrap(), "0.0.2");

    // 2. merge lane with comp-1 to an empty lane with .bitmap has the component: should merge
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(1, false, "");
    helper2.create_lane("dev", "");
    helper2.snap_all_components_without_build("");
    helper2.export("");
    helper2.switch_local_lane("main", "-x");
    helper2.create_lane("dev2", "");
    helper2.merge_lane("dev", "-x");
    let list = helper2.list_local_scope_parsed("");
    assert_eq!(list.as_array().unwrap().len(), 1);
}

#[test]
fn merge_from_main_when_a_component_head_is_a_tag_on_main_and_was_not_changed_on_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("dev", "");
    helper.populate_components(3, true, "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.merge_lane("dev", "-x");
    helper.tag_all_without_build("");
    helper.export("");
    helper.switch_local_lane("dev", "-x");
    helper.merge_lane("main", "-x");

    let status = helper.try_cmd("status");
    assert!(status.status.success(), "{status:?}");
}

#[test]
fn conflict_when_the_same_file_exist_in_base_deleted_on_the_lane_and_modified_on_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.write_file("comp1/foo.js", r#"console.log("v1");"#);
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("dev", "");
    helper.delete_path("comp1/foo.js");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.write_file("comp1/foo.js", r#"console.log("v2");"#);
    helper.tag_all_without_build("");
    helper.export("");

    let before_merge = helper.clone_workspace();

    // 1. when the lane is merged to main, so currently on the FS the file exits: should not remove the file
    helper.merge_lane("dev", "--manual -x");
    assert!(helper.scopes.local_path.join("comp1/foo.js").exists());

    // 2. when main is merged to the lane, so currently on the FS the file is removed: should add the file
    helper.get_cloned_workspace(&before_merge);
    helper.switch_local_lane("dev", "-x");
    assert!(!helper.scopes.local_path.join("comp1/foo.js").exists());
    helper.merge_lane("main", "--manual -x");
    assert!(helper.scopes.local_path.join("comp1/foo.js").exists());
}

#[test]
fn merging_from_a_lane_to_main_when_it_changed_version_object_with_squashed_property_and_then_re_imported_it()
 {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("--unmodified");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.export("");
    helper.switch_local_lane("lane-a", "-x");
    helper.snap_all_components_without_build("--unmodified");
    helper.merge_lane("lane-b", "-x");
    let after_first_merge = helper.clone_workspace();
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.merge_lane("lane-a", "-x");
    helper.import_and_get_objects();

    // 1. should not override the squashed property
    let head = helper.get_head("comp1");
    let ver = parse(&helper.cat_object(&head, false));
    assert!(ver["squashed"]["previousParents"].is_array());
    assert_eq!(
        ver["squashed"]["previousParents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert!(
        ver["squashed"]["previousParents"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!(head_on_lane_b)),
    );

    // 2. bit export should not throw
    helper.get_cloned_workspace(&after_first_merge);
    helper.switch_local_lane("main", "-x");
    helper.merge_lane("lane-a", "-x");
    let export = helper.try_cmd("export");
    assert!(export.status.success(), "{export:?}");
}

#[test]
fn merging_from_a_lane_to_main_when_it_has_a_long_history_which_does_not_exist_locally() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("");
    helper.snap_all_components_without_build("--unmodified");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    let before_merge = helper.clone_workspace();

    // 1. merging one component: should not throw
    let merge = helper.try_cmd(&format!(
        "lane merge {}/dev {}/comp1 --include-deps -x",
        helper.scopes.remote, helper.scopes.remote,
    ));
    assert!(merge.status.success(), "{merge:?}");

    // 2. merging the entire lane: bit export should not throw
    helper.get_cloned_workspace(&before_merge);
    helper.merge_lane(&format!("{}/dev", helper.scopes.remote), "-x");
    let export = helper.try_cmd("export");
    assert!(export.status.success(), "{export:?}");
}

#[test]
fn merge_introduces_a_new_component_to_a_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.create_lane("lane-a", "");
    helper.snap_Component_without_build("comp2", "");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.switch_local_lane("lane-a", "-x");
    helper.merge_lane("lane-b", "-x");
    helper.export("");

    let lane = parse(&helper.run_cmd(&format!(
        "lane show {}/lane-a --remote --json",
        helper.scopes.remote,
    )));
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
}

#[test]
fn merge_from_main_when_on_a_forked_new_lane_from_another_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let second_scope = helper.create_new_remote_scope();
    helper.add_remote_scope_with(&second_scope.scope_path);

    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");
    let main_ws = helper.clone_workspace();

    helper.add_default_scope(&second_scope.scope_name);
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.create_lane("lane-b", "");
    let lane_b_ws = helper.clone_workspace();

    helper.get_cloned_workspace(&main_ws);
    helper.merge_lane(&format!("{}/lane-a", second_scope.scope_name), "-x");
    helper.snap_all_components_without_build("--unmodified");
    helper.snap_all_components_without_build("--unmodified");
    helper.tag_all_without_build("--unmodified");
    helper.export("");

    helper.get_cloned_workspace(&lane_b_ws);
    helper.snap_all_components_without_build("--unmodified");
    helper.merge_lane(&format!("main {}/comp1", helper.scopes.remote), "-x");

    let export = helper.try_cmd("export");
    assert!(export.status.success(), "{export:?}");
}

#[test]
fn merge_an_out_of_date_component_from_another_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");
    let main_scope = helper.clone_workspace();
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.get_cloned_workspace(&main_scope);
    helper.tag_all_without_build("--unmodified");
    helper.tag_all_without_build("--unmodified");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.create_lane("lane-b", "");
    helper.merge_lane(&format!("{}/lane-a", helper.scopes.remote), "-x");
    helper.import_component("comp1", "--all-history --objects");

    let status = helper.status_json();
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
}

#[test]
fn merge_from_one_lane_to_another_with_squash() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("");
    let head_on_lane_a = helper.get_head_from_lane("lane-a", "comp1");
    helper.export("");

    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("--unmodified");
    let first_snap_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.snap_all_components_without_build("--unmodified");
    helper.snap_all_components_without_build("--unmodified");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.export("");

    helper.switch_local_lane("lane-a", "-x");
    helper.merge_lane("lane-b", "--squash -x");

    // 1. bit log should not include previous versions from lane-b
    let log = helper.log("comp1");
    assert!(log.contains(&head_on_lane_a));
    assert!(log.contains(&head_on_lane_b));
    assert!(!log.contains(&first_snap_on_lane_b));

    // 2. Version object should include the squash data
    let head_ver = parse(&helper.cat_object(&head_on_lane_b, false));
    assert_eq!(head_ver["squashed"]["laneId"]["name"].as_str().unwrap(), "lane-b");
}

#[test]
fn merge_from_one_lane_to_another_with_squash_when_it_has_history_in_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.tag_all_without_build("--unmodified");
    let head_on_main = helper.get_head("comp1");
    helper.export("");

    helper.create_lane("lane-a", "");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.create_lane("lane-b", "");
    helper.import_component("comp1", "-x");
    helper.snap_all_components_without_build("--unmodified");
    let first_snap_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.snap_all_components_without_build("--unmodified");
    let second_snap_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.snap_all_components_without_build("--unmodified");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_lane("lane-a", "-x");
    helper.merge_lane(&format!("{}/lane-b", helper.scopes.remote), "--squash -x");

    // 1. bit status should not throw
    let status = helper.try_cmd("status");
    assert!(status.status.success(), "{status:?}");

    // 2. Version object should have the main head as the parent and hold the squash data
    let head_ver = parse(&helper.cat_object(&head_on_lane_b, false));
    assert_eq!(head_ver["parents"], serde_json::json!([head_on_main]));
    assert_eq!(head_ver["squashed"]["laneId"]["name"].as_str().unwrap(), "lane-b");
    assert_eq!(head_ver["squashed"]["previousParents"], serde_json::json!([second_snap_on_lane_b]));
    let _ = first_snap_on_lane_b;
}

#[test]
fn when_a_file_was_deleted_on_the_other_lane_but_exist_current_and_on_the_base() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.write_file("comp1/foo.js", "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("lane-a", "");
    helper.delete_path("comp1/foo.js");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    let on_main = helper.clone_workspace();

    // when main is still at the base (fast-forward)
    let merge_output = helper.merge_lane("lane-a", "-x --no-auto-snap");
    // 1. should indicate that this file was removed in the output
    assert!(merge_output.contains("removed foo.js"));
    // 2. should remove this file from the filesystem
    assert!(!helper.scopes.local_path.join("comp1/foo.js").exists());

    // when both lanes are diverged
    helper.get_cloned_workspace(&on_main);
    helper.tag_all_without_build("--unmodified");
    helper.export("");
    let merge_output = helper.merge_lane("lane-a", "-x --no-auto-snap --no-squash");
    // 3. should indicate that this file was removed in the output
    assert!(merge_output.contains("removed foo.js"));
    // 4. should remove this file from the filesystem
    assert!(!helper.scopes.local_path.join("comp1/foo.js").exists());
}
