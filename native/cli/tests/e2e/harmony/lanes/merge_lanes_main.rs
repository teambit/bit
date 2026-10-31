//! `e2e/harmony/lanes/merge-lanes-main.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn merging_main_retains_the_types_package_added_by_the_incoming_side() {
    use crate::{commands::move_paths::support::setup, helper::config};
    use serde_json::json;
    use std::ffi::OsStr;
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.npm_add_fake_package("sample-package", "1.0.0", false);
    helper.output_file(
        "comp1/index.ts",
        "import sample from 'sample-package';\nexport default sample;\n",
    );
    setup(&helper, "add comp1");
    setup(&helper, "tag --message base");
    setup(&helper, "export");
    setup(&helper, "lane create dev");
    setup(&helper, "snap --unmodified --message lane");
    let lane = helper.clone_workspace();
    setup(&helper, "switch main -x");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{"@types/sample-package":"1.0.0"}}}),
    );
    setup(&helper, "tag --unmodified --message types");
    setup(&helper, "export");
    helper.get_cloned_workspace(&lane);
    let oracle = helper.clone_workspace();
    let command = "lane merge main -x";
    let expected = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.native_run(command);
    assert!(expected.status.success(), "{} {}", expected.stdout, expected.stderr);
    assert_eq!(actual.status.code(), expected.status.code(), "{} {}", actual.stdout, actual.stderr);
    assert_eq!(actual.stderr, expected.stderr);
    let native_head = helper.get_head_from_lane("dev", "comp1");
    let lane = parse(
        &Helper::cmd_in_with(&oracle, "cat-lane dev", &[("BIT_NATIVE", OsStr::new("off"))]).stdout,
    );
    let oracle_head = lane["components"][0]["head"].as_str().unwrap();
    // Each CLI allocates its own merge snap; all other report bytes must match.
    assert_eq!(
        actual.stdout.replace(&native_head, "SNAP_HASH"),
        expected.stdout.replace(oracle_head, "SNAP_HASH"),
    );
    let native_version = helper.cat_component_parsed(&format!("comp1@{native_head}"));
    let oracle_version = helper.cat_component_in_parsed(&format!("comp1@{oracle_head}"), &oracle);
    assert_eq!(native_version["devPackageDependencies"]["@types/sample-package"], "1.0.0");
    for field in [
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "overrides",
        "extensions",
        "files",
        "parents",
    ] {
        assert_eq!(native_version[field], oracle_version[field], "{field}");
    }
}

#[test]
fn merging_main_into_local_lane_and_when_deleted_or_tagged() {
    // 1. merging main into local lane: should not throw an error that main lane doesn't exist
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(1, false, "");
    helper.native("snap --skip-tests");
    let merge_output = helper.native("lane merge main -x");
    assert!(!merge_output.contains(r#"unable to switch to "main", the lane was not found"#));

    // 2. merge main into a lane when it is locally deleted on the lane: should show a descriptive error explaining why it cannot be merged
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.native("lane create dev");
    helper2.populate_components(1, false, "");
    helper2.native("snap --skip-tests");
    helper2.native("export");
    helper2.native("switch main -x");
    helper2.native(&format!("lane merge {}/dev -x", helper2.scopes.remote));
    helper2.native("tag --skip-tests");
    helper2.native("export");
    helper2.native("switch dev -x");
    helper2.native("delete comp1 --silent --lane");
    let err = helper2.cmd("lane merge main -x");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("component is locally deleted"));

    // 3. merging main into local lane when main has tagged versions: should not throw an error that main lane doesn't exist
    let helper3 = Helper::new();
    helper3.set_workspace_with_remote_scope();
    helper3.populate_components(1, false, "");
    helper3.native("tag --skip-tests");
    helper3.native("export");
    helper3.native("lane create dev");
    helper3.populate_components(1, false, " version2");
    helper3.native("snap --skip-tests");
    let merge_output = helper3.native("lane merge main -x");
    assert!(!merge_output.contains("getDivergeData: unable to find Version 0.0.1 of comp1"));
}

#[test]
fn merging_main_when_on_lane_and_some_workspace_components_belong_to_the_lane_some_belong_to_main()
{
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp1 --skip-tests --unmodified");
    helper.native("export");
    let head_comp1_on_lane = helper.get_head_from_lane("dev", "comp1");
    let lane_ws = helper.clone_workspace();

    helper.native("switch main -x");
    helper.populate_components(2, true, "version2");
    helper.native("tag --skip-tests");
    let comp1_tag2 = helper.get_head("comp1");
    let comp2_tag2 = helper.get_head("comp2");
    helper.native("tag --skip-tests --unmodified");
    let comp1_tag3 = helper.get_head("comp1");
    let comp2_tag3 = helper.get_head("comp2");
    helper.native("tag --skip-tests --unmodified");
    let comp1_head = helper.get_head("comp1");
    helper.native("export");

    // with --exclude-non-lane-comps flag
    helper.get_cloned_workspace(&lane_ws);
    helper.native("lane merge main --exclude-non-lane-comps -x");
    let lane = parse(&helper.native("lane show dev --json"));
    // 1. should not add non-lane components into the lane
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    // 2. should update comp1 on the lane because it is part of the lane
    let head = helper.get_head_from_lane("dev", "comp1");
    assert_ne!(head, head_comp1_on_lane);

    // 3. should not update non-lane components in the .bitmap
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp2"]["version"].as_str().unwrap(), "0.0.1");

    // 4. should update the component files only for lane components
    assert!(helper.read_file("comp1/index.js").contains("version2"));
    assert!(!helper.read_file("comp2/index.js").contains("version2"));

    // without --exclude-non-lane-comps flag
    helper.get_cloned_workspace(&lane_ws);
    helper.native("lane merge main -x");
    let lane = parse(&helper.native("lane show dev --json"));
    // 5. should not add non-lane components into the lane
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    // 6. should update comp1 on the lane because it is part of the lane
    let head = helper.get_head_from_lane("dev", "comp1");
    assert_ne!(head, head_comp1_on_lane);

    // 7. should update non-lane components in the .bitmap to the head of main
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp2"]["version"].as_str().unwrap(), "0.0.4");

    // 8. should update the component files in the filesystem for all of them
    assert!(helper.read_file("comp1/index.js").contains("version2"));
    assert!(helper.read_file("comp2/index.js").contains("version2"));

    // 9. should import the head of main
    let cat1 = helper.cmd(&format!("cat-object {comp1_head}"));
    assert!(cat1.status.success());

    // 10. should not import the main-history gap between the common-snap and the head of main
    assert!(
        !helper
            .cmd(&format!("cat-object {comp1_tag2}"))
            .status
            .success(),
    );
    assert!(
        !helper
            .cmd(&format!("cat-object {comp1_tag3}"))
            .status
            .success(),
    );

    // 11. should not import the history of workspace components that are not on the lane
    assert!(
        !helper
            .cmd(&format!("cat-object {comp2_tag2}"))
            .status
            .success(),
    );
    assert!(
        !helper
            .cmd(&format!("cat-object {comp2_tag3}"))
            .status
            .success(),
    );

    // 12. should export the lane successfully after the merge
    let export = helper.native_run("export");
    assert!(export.status.success(), "{export:?}");
}

#[test]
fn merging_main_lane_with_no_snapped_components_and_merging_lane_into_empty_main() {
    // 1. merging main lane with no snapped components: should not throw an error about missing objects
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("lane create dev");
    let merge_output = helper.native("lane merge main -x");
    assert!(!merge_output.contains(
        "component comp1 is on the lane but its objects were not found, please re-import the lane"
    ));

    // 2. merging a lane into main when main is empty
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(1, false, "");
    helper2.native("lane create dev");
    helper2.native("snap --skip-tests");
    helper2.native("switch main -x");
    let merge_output = helper2.native(&format!("lane merge {}/dev -x", helper2.scopes.remote));
    assert!(merge_output.contains("successfully merged"));
    let list = helper2.list_local_scope_parsed("");
    assert_eq!(list.as_array().unwrap().len(), 1);
}

#[test]
fn merge_main_to_lane_when_they_are_diverged_with_dependencies_update_auto_after_deleted_deps_set()
{
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("deps set comp1 lodash@^4.17.21");
    helper.npm_add_fake_package("lodash", "4.17.21", false);
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp1 --skip-tests --unmodified");
    helper.native("export");
    helper.native("switch main -x");
    helper.native("deps unset comp1 lodash");
    helper.native(r#"tag --skip-tests --unmodified -m "second tag on main""#);
    helper.native("export");
    helper.native("switch dev -x");
    helper.run("lane merge main -x --ignore-config-changes");

    let comp1_head_on_lane =
        helper.get_head_from_lane(&format!("{}/dev", helper.scopes.remote), "comp1");
    let comp = parse(&helper.cat_component(&format!("comp1@{comp1_head_on_lane}")));
    let dep_resolver = comp["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"] == "teambit.dependencies/dependency-resolver")
        .unwrap();

    // 1. should remove the dependency that was unset in main from the config.policy
    assert!(dep_resolver["config"]["policy"].get("dependencies").is_none());

    // 2. should update the dependencies according to main
    assert_eq!(comp["dependencies"][0]["id"]["name"].as_str().unwrap(), "comp2");
    assert_eq!(comp["dependencies"][0]["id"]["version"].as_str().unwrap(), "0.0.2");
    assert_eq!(comp["flattenedDependencies"][0]["version"].as_str().unwrap(), "0.0.2");
    let comp2 = dep_resolver["data"]["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| {
            dep["id"]
                .as_str()
                .unwrap()
                .contains("comp2")
        })
        .unwrap();
    assert_eq!(comp2["version"].as_str().unwrap(), "0.0.2");

    // 3. should keep other DependencyResolver data fields, such as packageName
    assert_eq!(
        dep_resolver["data"]["packageName"].as_str().unwrap(),
        format!("@{}/comp1", helper.scopes.remote),
    );
}

#[test]
fn bit_merge_on_main_when_the_remote_main_has_advanced_by_multiple_snaps_diverged() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("snap --skip-tests");
    helper.native("export");
    let ws1 = helper.clone_workspace();

    helper.native("snap --skip-tests --unmodified");
    let remote_gap_snap = helper.get_head("comp1");
    helper.native("snap --skip-tests --unmodified");
    let remote_head_snap = helper.get_head("comp1");
    helper.native("export");

    helper.get_cloned_workspace(&ws1);
    helper.native("snap --skip-tests --unmodified");
    let local_snap = helper.get_head("comp1");
    helper.native(&format!("import {}/comp1 --objects", helper.scopes.remote));
    helper.native("merge comp1 --auto-merge-resolve theirs -x");

    // 1. should generate a snap-merge snap with two parents, the local and the remote
    let head = helper.get_head("comp1");
    let cat_ver = parse(&helper.cat_object(&head, false));
    assert_eq!(cat_ver["parents"], serde_json::json!([local_snap, remote_head_snap]));

    // 2. should not import the gap between the common-snap and the remote head
    let cat_gap = helper.cmd(&format!("cat-object {remote_gap_snap}"));
    assert!(!cat_gap.status.success());

    // 3. should export the merge-snap successfully
    let export = helper.native_run("export");
    assert!(export.status.success(), "{export:?}");

    // 4. bit log should show the full history including the gap snap
    let log = parse(&helper.run("log comp1 --json"));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(hashes.contains(&remote_gap_snap.as_str()));
    assert!(hashes.contains(&remote_head_snap.as_str()));
    assert!(hashes.contains(&local_snap.as_str()));
}

#[test]
fn merging_main_into_a_lane_when_main_added_a_new_package_dependency() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let pkg_name = "is-positive";
    let filler = (0..10)
        .map(|i| format!("// filler line {i}"))
        .collect::<Vec<_>>()
        .join("\n");
    let base_file = format!("{filler}\nmodule.exports = () => 'comp1';\n");
    helper.populate_components(1, false, "");
    helper.write_file("comp1/index.js", &base_file);
    helper.native("tag --skip-tests");
    helper.native("export");

    helper.native("lane create dev");
    helper.write_file("comp1/index.js", &format!("{base_file}// lane-only change\n"));
    helper.native("snap --skip-tests");
    helper.native("export");
    helper.run("install");
    let lane_ws = helper.clone_workspace();

    helper.native("switch main -x");
    helper.run(&format!("install {pkg_name}@3.1.0"));
    helper.write_file(
        "comp1/index.js",
        &format!("const isPositive = require('{pkg_name}');\n{base_file}"),
    );
    helper.native("tag --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&lane_ws);
    let merge_output = helper.native("lane merge main");

    // 1. should install the dependency added on main and complete the auto-snap
    assert!(!merge_output.contains("snap error"), "{merge_output}");
    assert!(!merge_output.contains("missing packages"), "{merge_output}");
    assert!(merge_output.contains("merge-snapped components (1)"), "{merge_output}");

    // 2. should have the new dependency in node_modules
    assert!(
        helper.scopes.local_path
            .join(format!("node_modules/{pkg_name}"))
            .exists(),
    );
}
