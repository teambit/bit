//! `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn naming_conflict_introduced_during_the_merge() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.write_file("comp1-foo/index.ts", "");
    helper.add_component("comp1-foo", "--id comp1/foo");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_lane("lane-a", "-x");

    let merge = helper.try_cmd(&format!("lane merge {}/lane-b -x", helper.scopes.remote));
    assert!(merge.status.success(), "{merge:?}");
    assert!(
        helper.scopes.local_path
            .join(&helper.scopes.remote)
            .join("comp1_1")
            .exists(),
    );
}

#[test]
fn merge_lane_a_to_main_with_squashing_then_from_main_to_lane_b_which_forked_from_lane_a() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    let lane_b_ws = helper.clone_workspace();

    helper.switch_local_lane("lane-a", "-x");
    helper.snap_all_components_without_build("--unmodified");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.merge_lane("lane-a", "-x");
    helper.tag_all_without_build("");
    helper.export("");

    helper.get_cloned_workspace(&lane_b_ws);
    let merge = helper.try_cmd("lane merge main -x");
    assert!(merge.status.success(), "{merge:?}");
}

#[test]
fn renaming_files_from_uppercase_to_lowercase() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.write_file("comp1/Foo.js", "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("lane-a", "");
    helper.delete_path("comp1/Foo.js");
    helper.write_file("comp1/foo.js", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    let on_lane_a = helper.clone_workspace();
    helper.switch_local_lane("main", "-x");

    let files = helper.get_component_files("comp1");
    assert!(files.contains(&"Foo.js".to_string()));
    assert!(!files.contains(&"foo.js".to_string()));

    // 1. merging: should get the rename from the other lane
    helper.merge_lane("lane-a", "-x");
    let files = helper.get_component_files("comp1");
    assert!(files.contains(&"foo.js".to_string()));
    assert!(!files.contains(&"Foo.js".to_string()));

    // 2. switching: should remove the file from the current lane and write the file according to the switch-to lane
    helper.get_cloned_workspace(&on_lane_a);
    let files = helper.get_component_files("comp1");
    assert!(files.contains(&"foo.js".to_string()));
    assert!(!files.contains(&"Foo.js".to_string()));
    helper.switch_local_lane("main", "-x");
    let files = helper.get_component_files("comp1");
    assert!(files.contains(&"Foo.js".to_string()));
    assert!(!files.contains(&"foo.js".to_string()));
}

#[test]
fn multiple_files_some_are_not_changes() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("lane-a", "");
    helper.populate_components(1, false, "");
    helper.write_file("comp1/foo.js", "console.log('foo');");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    let output = helper.switch_local_lane("lane-a", "-x");

    // 1. expect to have all files as unchanged, not updated
    assert!(!output.contains("updated"));

    // 2. merge the lane: expect to have all files as unchanged, not updated
    let output = helper.merge_lane("lane-b", "-x");
    assert!(!output.contains("updated"));
}

#[test]
fn merging_from_main_when_main_is_ahead_so_then_a_snap_of_an_existing_tag_is_in_bitmap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.merge_lane("lane-a", "-x");
    helper.tag_all_without_build("--unmodified");
    helper.export("");
    helper.switch_local_lane("lane-a", "-x");
    helper.merge_lane("main", "-x");

    // 1. bit status should not show the component as modified
    let status = helper.status_json();
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 2. the dependency should use the tag not the snap
    let show = parse(&helper.show_component_parsed("comp1"));
    assert_eq!(
        show["dependencies"][0]["id"].as_str().unwrap(),
        format!("{}/comp2@0.0.2", helper.scopes.remote),
    );

    // 3. snapping the dependent: should save the dependency with tag, not snap
    helper.snap_Component_without_build("comp1", "");
    let comp = parse(&helper.cat_component(&format!("{}/comp1@latest", helper.scopes.remote)));
    assert_eq!(comp["dependencies"][0]["id"]["version"].as_str().unwrap(), "0.0.2");
    assert_eq!(comp["flattenedDependencies"][0]["version"].as_str().unwrap(), "0.0.2");
}

#[test]
fn when_a_file_exists_in_local_and_others_but_not_in_base() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("lane-a", "");
    helper.write_file("comp1/foo.js", "console.log('lane-a');");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.create_lane("lane-b", "");
    helper.write_file("comp1/foo.js", "console.log('lane-b');");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.merge_lane("lane-a", "--manual -x");
    let content = helper.read_file("comp1/foo.js");
    assert!(content.contains(">>>>>>>"));
    assert!(content.contains("<<<<<<<"));
}

#[test]
fn merging_lane_with_a_component_newly_introduced_where_it_was_a_package_before() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    let lane_a_ws = helper.clone_workspace();
    helper.switch_local_lane("main", "-x");
    helper.merge_lane("lane-a", "-x");
    helper.export("");
    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");

    let pkg = format!("@{}/comp2", helper.scopes.remote);
    helper.get_cloned_workspace(&lane_a_ws);
    helper.npm_add_fake_package(&pkg, "0.0.1", false);
    helper.add_key_val_to_dependency_resolver_policy(&pkg, "0.0.1");
    let ws_before = helper.read_workspace_jsonc();
    assert!(
        ws_before["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]
            .get(&pkg)
            .is_some(),
    );

    helper.merge_lane("lane-b", "-x");
    let ws_after = helper.read_workspace_jsonc();
    assert!(
        ws_after["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]
            .get(&pkg)
            .is_none(),
    );
}

#[test]
fn bit_lane_merge_move_command() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("dev", "");
    helper.populate_components(3, true, "on-lane");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.populate_components(3, true, "on-main");
    helper.tag_all_without_build("");
    helper.export("");
    helper.switch_local_lane("dev", "-x");
    helper.merge_lane("main", "-x --manual");
    helper.populate_components(3, true, "fixed-conflicts");
    let old_snap_comp1 = helper.get_head_from_lane("dev", "comp1");
    let snap_comp2 = helper.get_head_from_lane("dev", "comp2");
    helper.snap_Component_without_build("comp1", "");
    let new_snap_comp1 = helper.get_head_from_lane("dev", "comp1");
    helper.run_cmd("lane merge-move new-lane");

    // 1. should create a new lane
    let current_lane = helper.run_cmd("lane current");
    assert!(current_lane.contains("new-lane"));

    // 2. the new lane should have the new local snaps created on the original lane
    let new_lane = parse(&helper.run_cmd("cat-lane new-lane"));
    assert_eq!(
        new_lane["components"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );
    assert_eq!(helper.get_head_from_lane("new-lane", "comp1"), new_snap_comp1);

    // 3. the new lane should have the same components as the original lane
    assert_eq!(helper.get_head_from_lane("new-lane", "comp2"), snap_comp2);

    // 4. the filesystem should stay the same
    assert!(helper.read_file("comp1/index.js").contains("fixed-conflicts"));
    assert!(helper.read_file("comp2/index.js").contains("fixed-conflicts"));

    // 5. the original lane should be reverted to the before-merge state
    assert_eq!(helper.get_head_from_lane("dev", "comp1"), old_snap_comp1);
}

#[test]
fn no_snap_vs_no_auto_snap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("");
    let comp1_head_on_lane_a = helper.get_head_from_lane("lane-a", "comp1");
    let comp2_head_on_lane_a = helper.get_head_from_lane("lane-a", "comp2");
    helper.export("");

    helper.create_lane("lane-b", "");
    helper.populate_components(2, true, "v2");
    helper.snap_all_components_without_build("");
    let comp1_head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    let comp2_head_on_lane_b = helper.get_head_from_lane("lane-b", "comp2");
    helper.export("");

    helper.switch_local_lane("lane-a", "-x");
    let before_merge = helper.clone_workspace();

    // with --no-auto-snap
    helper.merge_lane("lane-b", "--no-auto-snap -x");
    // 1. should update current lane according to the merged one
    assert_eq!(helper.get_head_from_lane("lane-a", "comp1"), comp1_head_on_lane_b);
    assert_eq!(helper.get_head_from_lane("lane-a", "comp2"), comp2_head_on_lane_b);
    // 2. should not leave the components as modified
    let status = helper.status_json();
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // with --no-snap
    helper.get_cloned_workspace(&before_merge);
    helper.merge_lane("lane-b", "--no-snap -x");
    // 3. should not update current lane according to the merged one
    assert_eq!(helper.get_head_from_lane("lane-a", "comp1"), comp1_head_on_lane_a);
    assert_eq!(helper.get_head_from_lane("lane-a", "comp2"), comp2_head_on_lane_a);
    // 4. should leave the components as modified
    let status = helper.status_json();
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    // 5. after snapping: should save two parents, from the current lane and from the merged lane
    helper.snap_all_components_without_build("");
    let head = helper.get_head_from_lane("lane-a", "comp1");
    let ver = parse(&helper.cat_object(&head, false));
    assert_eq!(ver["parents"], serde_json::json!([comp1_head_on_lane_a, comp1_head_on_lane_b]));
}

#[test]
fn merging_from_lane_with_no_snap_when_there_is_no_base_snap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.create_lane("lane-a", "");
    helper.snap_all_components_without_build("");
    helper.switch_local_lane("main", "-x");
    let merge = helper.try_cmd("lane merge lane-a --no-snap -x");
    assert!(merge.status.success(), "{merge:?}");
}

#[test]
fn merge_with_detach_head() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_all_without_build("--ver 1.0.0");
    let common_snap = helper.get_head("comp1");
    helper.tag_all_without_build("--unmodified --ver 2.0.0");
    helper.export("");
    let head_on_main = helper.get_head("comp1");
    helper.checkout("1.0.0 '**' -x");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("--unmodified");
    let first_snap_on_lane = helper.get_head_from_lane("dev", "comp1");
    helper.snap_all_components_without_build("--unmodified");
    let head_on_lane = helper.get_head_from_lane("dev", "comp1");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.merge_lane("dev", "--detach-head -x");

    // 1. should not change the head
    let current_head = helper.get_head("comp1");
    assert_eq!(current_head, head_on_main);
    assert_ne!(current_head, head_on_lane);

    // 2. should save the detached head
    let comp = parse(&helper.cat_component("comp1"));
    assert_eq!(comp["detachedHeads"]["current"].as_str().unwrap(), head_on_lane);

    // 3. should continue the history from the common snap, not from the head
    let ver = parse(&helper.cat_object(&head_on_lane, true));
    assert_eq!(ver["parents"], serde_json::json!([common_snap]));

    // 4. should squash successfully
    assert_eq!(ver["squashed"]["previousParents"][0].as_str().unwrap(), first_snap_on_lane);
}

#[test]
fn merge_with_build_loose() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");

    helper.create_lane("dev", "");
    helper.write_file(
        "comp1/comp1.spec.ts",
        "describe('test', () => { it('should fail', () => { expect(true).toBe(false); }); });",
    );
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.switch_local_lane("main", "-x");
    helper.tag_all_without_build("--unmodified");

    let merge_output = helper.run_cmd("lane merge dev --build --loose --no-squash");

    // 1. should succeed despite test failures
    assert!(merge_output.contains("Total Snapped: 1"));
    // 2. should indicate that the test failed
    assert!(merge_output.contains(r#"task "teambit.defender/tester:JestTest" has failed"#));
}
