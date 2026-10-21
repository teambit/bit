//! `e2e/harmony/lanes/lane-import.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn update_components_from_remote_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    let before_new_snap = helper.clone_workspace();
    helper.populate_components(3, true, "v2");
    helper.snap_all_components_without_build("");
    let remote_head = helper.get_head_from_lane("dev", "comp1");
    helper.export("");

    // running "bit import" when the local is behind
    helper.get_cloned_workspace(&before_new_snap);
    helper.import_and_get_objects();

    // 1. bit import should not only bring the components but also merge the lane object
    let head = helper.get_head_from_lane("dev", "comp1");
    assert_eq!(head, remote_head);

    // 2. bit status should show the components as pending-updates
    let status = helper.status_json();
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    // 3. bit checkout head --all should update them all to the head version
    helper.checkout_all_updated("--skip-dependency-installation");
    let status = helper.status_json();
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // running "bit import" when the remote is behind
    helper.get_cloned_workspace(&before_new_snap);
    helper.populate_components(3, true, "v3");
    helper.snap_all_components_without_build("");
    helper.import_and_get_objects();

    // 4. bit import should not change the heads with the older snaps
    let status = helper.status_json();
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 5. bit status should still show the components as staged
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    // running "bit import" when the remote and the local have diverged
    helper.get_cloned_workspace(&before_new_snap);
    helper.import_and_get_objects();
    helper.checkout_all_updated("--skip-dependency-installation");
    helper.populate_components(3, true, "v3");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.get_cloned_workspace(&before_new_snap);
    helper.populate_components(3, true, "v4");
    helper.snap_all_components_without_build("");
    helper.import_and_get_objects();

    // 6. bit import should not change the heads with the older snaps
    let status = helper.status_json();
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 7. bit status should show the components as pending-merge
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    // 8. bit merge with no args should merge them
    let output = helper.run_cmd("merge --manual --skip-dependency-installation");
    assert!(output.contains("successfully merged"));
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
fn some_components_are_on_a_lane_some_are_not() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_Without_Build_id("comp3", "");
    helper.export("");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp3", "");

    // 1. bit list should not show components from the lanes
    let list = helper.list_local_scope_parsed("");
    assert_eq!(list.as_array().unwrap().len(), 1);

    // 2. bit import should not throw
    let import = helper.try_cmd("import");
    assert!(import.status.success(), "{import:?}");
}

#[test]
fn deleting_the_local_scope_after_exporting_a_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("dev", "");
    helper.populate_components(1, true, "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.delete_path(".bit");
    helper.run_cmd("init");
    helper.add_remote_scope();

    // 1. should re-create scope.json with checkout to the lane specified in the .bitmap file
    let lanes = parse(&helper.run_cmd("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("dev"));

    // 2. bit import should not throw an error
    let import = helper.try_cmd("import");
    assert!(import.status.success(), "{import:?}");
}

#[test]
fn import_from_one_lane_to_another_directly_and_lane_a_snap_blocking() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("lane-a", "");
    helper.populate_components(1, false, "");
    helper.snap_all_components_without_build("");
    let head_on_lane_a = helper.get_head_from_lane("lane-a", "comp1");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.populate_components(1, false, "from-lane-b");
    helper.snap_all_components_without_build("");
    helper.export("");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");
    helper.switch_local_lane("lane-a", "-x");
    helper.populate_components(1, false, "from-lane-a");
    helper.snap_all_components_without_build("");
    helper.export("");

    // should block the import
    let err = helper.try_cmd(&format!("import {}/comp1@{head_on_lane_b} -x", helper.scopes.remote));
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(
        combined.contains(
            "unable to import the following component(s) as they belong to other lane(s)"
        ),
        "{combined}",
    );

    // importing a lane-a snap from a workspace that is not on lane-a
    helper.re_init_workspace();
    helper.add_remote_scope();

    // when on main: should block the import
    let err = helper.try_cmd(&format!("import {}/comp1@{head_on_lane_a} -x", helper.scopes.remote));
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(
        combined.contains(
            "unable to import the following component(s) as they belong to other lane(s)"
        ),
        "{combined}",
    );

    // when on another lane that does not have the component: should block the import
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.create_lane("lane-c", "");
    let err = helper.try_cmd(&format!("import {}/comp1@{head_on_lane_a} -x", helper.scopes.remote));
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(
        combined.contains(
            "unable to import the following component(s) as they belong to other lane(s)"
        ),
        "{combined}",
    );
}

#[test]
fn import_from_one_lane_to_another_directly_when_current_lane_does_have_the_component() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("lane-a", "");
    helper.populate_components(1, false, "");
    helper.snap_all_components_without_build("");
    let lane_a_snap1 = helper.get_head_from_lane("lane-a", "comp1");
    helper.export("");
    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("--unmodified");
    let lane_b_snap1 = helper.get_head_from_lane("lane-b", "comp1");
    helper.export("");
    helper.switch_local_lane("lane-a", "-x");
    helper.snap_all_components_without_build("--unmodified");
    let lane_a_snap2 = helper.get_head_from_lane("lane-a", "comp1");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_lane("lane-b", "-x");
    helper.import_component("comp1", "-x");

    // 1. should not bring that snap
    let err = helper.try_cmd(&format!("cat-object {lane_a_snap2}"));
    assert!(!err.status.success());

    // 2. should not change .bitmap
    let bitmap = helper.read_bit_map();
    let ver = bitmap["comp1"]["version"].as_str().unwrap();
    assert_eq!(ver, lane_b_snap1);
    assert_ne!(ver, lane_a_snap1);
    assert_ne!(ver, lane_a_snap2);
}

#[test]
fn checking_out_to_a_different_version_from_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.tag_all_without_build("--unmodified");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.create_lane("dev", "");
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.snap_all_components_without_build("");
    helper.import_component("comp1@0.0.1", "--save-in-lane -x");
    helper.export("");

    helper.checkout("0.0.2 comp1 -x");
    helper.run_cmd("init --reset-scope");
    helper.run_cmd("import -x");

    // 1. bit import should bring the version in the bitmap
    let cat_ver =
        helper.try_cmd(&format!("cat-component {}/comp1@0.0.2 --json", helper.scopes.remote));
    assert!(cat_ver.status.success(), "{cat_ver:?}");

    // 2. bit status should not throw ComponentsPendingImport
    let status = helper.try_cmd("status");
    assert!(status.status.success(), "{status:?}");
}

#[test]
fn create_comp_on_a_lane_then_same_on_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("dev", "");
    helper.populate_components(1, false, "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.populate_components(1, false, "");
    helper.run_cmd(&format!("fetch {}/dev --lanes", helper.scopes.remote));

    let status = helper.try_cmd("status");
    assert!(status.status.success(), "{status:?}");
}

#[test]
fn lane_import_with_env_using_plus_version_for_component_peer_dependency_snaps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;

    helper.write_file("comp1/index.js", r#"module.exports = function() { return "comp1"; };"#);
    helper.add_component("comp1", "");

    helper.write_file(
        "empty-env/empty-env.bit-env.ts",
        "export class EmptyEnv {}\nexport default new EmptyEnv();\n",
    );
    helper.write_file("empty-env/index.ts", "export { EmptyEnv } from './empty-env.bit-env';");
    helper.add_component("empty-env", "");
    helper.add_extension_to_variant("empty-env", "teambit.envs/env", serde_json::json!({}));

    let comp1_pkg_name = format!("@{remote}/comp1");
    let env_jsonc = serde_json::json!({
        "policy": {
            "peers": [
                {
                    "name": comp1_pkg_name,
                    "version": "+",
                    "supportedRange": "^0.0.1"
                }
            ]
        }
    });
    helper.write_file("empty-env/env.jsonc", &serde_json::to_string_pretty(&env_jsonc).unwrap());

    helper.write_file("comp2/index.js", r#"module.exports = function() { return "comp2"; };"#);
    helper.add_component("comp2", "");
    helper.run_cmd("envs set comp2 empty-env");

    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    let output = helper.import_lane("dev", &format!("--pattern {remote}/comp2"));
    assert!(!output.contains("isn't supported by any available resolver"));
    assert!(!output.contains("@+"));
}

#[test]
fn getting_new_components_from_the_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("dev", "");
    helper.populate_components(1, true, "");
    helper.snap_all_components_without_build("");
    helper.export("");

    let first_ws = helper.clone_workspace();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_lane("dev", "-x");
    let second_ws = helper.clone_workspace();

    helper.get_cloned_workspace(&first_ws);
    helper.populate_components(2, true, "");
    helper.snap_all_components_without_build("");
    helper.export("");
    let first_ws_after_export = helper.clone_workspace();

    helper.get_cloned_workspace(&second_ws);

    // 1. bit checkout with --workspace-only flag should not add the component and should suggest omitting --workspace-only flag
    let output = helper.checkout("head --skip-dependency-installation --workspace-only");
    let list = parse(&helper.run_cmd("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert!(output.contains("omit --workspace-only flag to add them"));

    // 2. bit checkout without --workspace-only flag should add the new components
    helper.checkout("head --skip-dependency-installation");
    let list = parse(&helper.run_cmd("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 2);

    // when the new component is soft-removed
    helper.get_cloned_workspace(&first_ws_after_export);
    helper.run_cmd("delete comp2 --silent --lane");
    helper.write_file("comp1/index.js", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.get_cloned_workspace(&second_ws);
    helper.run_cmd("import -x");
    let before_checkout = helper.clone_workspace();

    // 3. bit checkout with --workspace-only flag, should not suggest omitting it
    let output = helper.checkout("head --skip-dependency-installation");
    assert!(!output.contains("omit --workspace-only flag to add them"));
    assert!(!output.contains("comp2"));

    // 4. bit checkout head should not add it
    helper.get_cloned_workspace(&before_checkout);
    helper.checkout("head --skip-dependency-installation");
    let list = parse(&helper.run_cmd("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 1);
}

#[test]
fn bit_lane_import_current_lane_behavior() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("lane-a", "");
    helper.populate_components(1, false, "");
    helper.snap_all_components_without_build("");
    helper.export("");
    let remote_lane_ref = format!("{}/lane-a", helper.scopes.remote);

    // when on the default lane (main): should switch to the imported lane
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_lane("lane-a", "-x");
    let lanes = parse(&helper.run_cmd("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("lane-a"));

    // when on a different lane with an uncommitted edit to a tracked component
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.create_lane("lane-b", "");
    helper.write_file("comp-on-b/index.js", "module.exports = () => 'comp-on-b initial';");
    helper.add_component("comp-on-b", "");
    helper.snap_all_components_without_build("");
    let local_edit = "// uncommitted local edit on lane-b";
    helper.write_file("comp-on-b/index.js", local_edit);
    let import_output = helper.import_lane("lane-a", "-x");

    // 1. should not switch lanes
    let lanes = parse(&helper.run_cmd("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("lane-b"));

    // 2. should preserve the uncommitted edit to the tracked component
    assert_eq!(helper.read_file("comp-on-b/index.js"), local_edit);

    // 3. should keep the lane-b component in the workspace
    let list = parse(&helper.run_cmd("list --json"));
    let ids: Vec<&str> = list
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|comp| comp["id"].as_str())
        .collect();
    assert!(
        ids.iter()
            .any(|id| id.contains("comp-on-b")),
    );

    // 4. should print a hint instructing the user to run "bit switch" to actually switch
    assert!(import_output.contains("bit switch"), "{import_output}");
    assert!(import_output.contains(&remote_lane_ref), "{import_output}");

    // 5. should make the imported lane appear in "bit lane list"
    let lanes = parse(&helper.run_cmd("lane list --json"));
    assert!(
        lanes["lanes"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|lane| {
                lane["name"]
                    .as_str()
                    .or_else(|| lane["id"]["name"].as_str())
            })
            .any(|name| name == "lane-a"),
        "{lanes}",
    );
}

#[test]
fn bit_lane_import_when_on_the_same_lane_being_imported() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("lane-a", "");
    helper.populate_components(1, false, "");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_lane("lane-a", "-x");
    let local_file_content = "// uncommitted local change";
    helper.write_file("comp1/local.ts", local_file_content);
    let workspace_with_local_edit = helper.clone_workspace();

    // collaborator workspace: snap and export a new head on the same lane to advance the remote
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_lane("lane-a", "-x");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    let new_remote_head = helper.get_head_from_lane("lane-a", "comp1");

    helper.get_cloned_workspace(&workspace_with_local_edit);

    // running "bit lane import" for the current lane
    let import_output = helper.import_lane("lane-a", "-x");

    // 1. should keep the same current lane
    let lanes = parse(&helper.run_cmd("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("lane-a"));

    // 2. should preserve uncommitted local file changes
    assert_eq!(helper.read_file("comp1/local.ts"), local_file_content);

    // 3. should fetch the latest lane head from the remote
    let head_on_local_lane = helper.get_head_from_lane("lane-a", "comp1");
    assert_eq!(head_on_local_lane, new_remote_head);

    // 4. should make it clear the user is already on the lane and the workspace was not updated
    assert!(import_output.contains("already on lane"), "{import_output}");
    assert!(import_output.contains("not"), "{import_output}");
    assert!(import_output.contains("updated"), "{import_output}");

    // 5. should prominently tell the user to run "bit checkout head" to update the workspace
    assert!(import_output.contains("bit checkout head"), "{import_output}");
}
