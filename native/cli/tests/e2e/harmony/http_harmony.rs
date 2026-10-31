use crate::helper::{Helper, config};
use serde_json::json;
use std::ffi::OsStr;

#[test]
fn http_export_log_import_remove_and_lane_list() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.run("lane create dev");
    helper.snap_all_components_without_build("");
    helper.export("");
    let scope = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_default_scope(&scope);
    helper.output_file("comp4/index.js", "module.exports = () => 'comp4';");
    helper.add_component("comp4", "--id comp4");
    helper.tag_all_without_build("");
    let export_out = helper.export("");
    assert!(
        export_out.contains("exported components (1)") || export_out.contains("comp4"),
        "{export_out}",
    );
    let log_out = helper.run(&format!("log {scope}/comp4 --remote"));
    assert!(log_out.contains("0.0.1") && log_out.contains("tag 0.0.1"));
    helper.re_init_workspace();
    helper.add_remote_scope();
    assert!(helper.import_component("comp4", "-x").contains("successfully imported one component"));
    let remove_out = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!("delete {scope}/comp4 --hard --silent"),
        &[("BIT_FEATURES", OsStr::new("hard-delete"))],
    );
    assert!(remove_out.status.success(), "{}", remove_out.stderr);
    assert!(remove_out.stdout.contains("successfully removed components from the remote scope"));
    let remote_list = helper.list_remote_scope_parsed("");
    let has_comp4 = remote_list
        .as_array()
        .expect("remote list array")
        .iter()
        .filter_map(|item| item["id"].as_str())
        .any(|id| id.ends_with("/comp4"));
    assert!(!has_comp4);
    assert!(
        helper
            .run(&format!("lane list -r {scope}"))
            .contains("dev"),
    );
}

#[test]
fn export_to_new_lane_and_delete_component() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.run("delete comp2 --silent");
    helper.output_file("comp1/index.js", "");
    helper.snap_all_components_without_build("");
    let export_out = helper.export("");
    assert!(!export_out.is_empty());

    let list = helper.list_remote_scope_parsed("");
    let list_arr = list.as_array().expect("remote list array");
    assert_eq!(list_arr.len(), 1);
    assert!(
        list_arr[0]["id"]
            .as_str()
            .is_some_and(|id| id.ends_with("/comp1")),
    );

    let list_deleted = helper.list_remote_scope_parsed("--include-deleted");
    let deleted_arr = list_deleted.as_array().expect("remote list deleted array");
    assert_eq!(deleted_arr.len(), 2);
}

#[test]
fn export_to_new_lane_snap_export_and_remove_lane_on_remote() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("lane create dev");
    helper.snap_all_components_without_build("");
    helper.export("");

    helper.snap_all_components_without_build("--unmodified");
    let second_export = helper.export("");
    assert!(!second_export.is_empty());

    let scope = helper.scopes.remote.clone();
    let remove_lane = helper.run(&format!("lane remove {scope}/dev -r -s -f"));
    assert!(remove_lane.contains("successfully removed the following lane(s)"));
    let lane_list = helper.run(&format!("lane list -r {scope}"));
    assert!(!lane_list.contains("dev"));
}

#[test]
fn delete_dependency_component_with_hard() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");
    helper.export("");

    let scope = helper.scopes.remote.clone();
    let delete_cmd = format!("delete {scope}/comp2 --hard --silent --force");
    let delete_out = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &delete_cmd,
        &[("BIT_FEATURES", OsStr::new("hard-delete"))],
    );
    assert!(delete_out.status.success(), "{}", delete_out.stderr);

    let list = helper.list_remote_scope_parsed("");
    let list_arr = list.as_array().expect("remote list array");
    assert_eq!(list_arr.len(), 1);
    assert!(
        list_arr[0]["id"]
            .as_str()
            .is_some_and(|id| id.ends_with("/comp1")),
    );

    helper.re_init_workspace();
    helper.add_remote_scope();
    let import_out = helper.import_component("comp1", "-x");
    assert!(import_out.contains("successfully imported one component"));

    let status_out = helper.run("status");
    assert!(status_out.contains("comp2"));
}

#[test]
fn import_pattern_with_nested_namespaces() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("examples/hello-world/index.js", "");
    helper.add_component("examples/hello-world", "--id examples/hello-world");
    helper.output_file("beta/vitest-4/examples/hello-world/index.js", "");
    helper.add_component(
        "beta/vitest-4/examples/hello-world",
        "--id beta/vitest-4/examples/hello-world",
    );
    helper.output_file("beta/other/component/index.js", "");
    helper.add_component("beta/other/component", "--id beta/other/component");
    helper.tag_all_without_build("");
    helper.export("");

    let scope = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!(r#"import "{scope}/examples/**" -x"#));

    let bitmap = helper.read_bit_map();
    let keys: Vec<&String> = bitmap
        .as_object()
        .expect("bitmap object")
        .keys()
        .filter(|k| *k != "$schema-version")
        .collect();
    assert_eq!(keys.len(), 1);
    assert_eq!(keys[0].as_str(), "examples/hello-world");
}

#[test]
fn workspace_extension_with_options_and_legacy_merging() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.copy_fixture_extensions("dummy-extension");
    helper.add_component("dummy-extension", "--id dummy-extension");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/dummy-extension", helper.scopes.remote),
        json!({ "my-option": "custom-val" }),
    );
    helper.populate_components(1, false, "");
    helper.add_extension_to_variant(
        "*",
        &format!("{}/dummy-extension", helper.scopes.remote),
        json!({ "first": "val" }),
    );
    let show = helper.native("show comp1 --json");
    assert!(show.contains("comp1"));
}

#[test]
fn loading_core_legacy_convertor_extension() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.add_extension_to_variant(
        "*",
        "teambit.pkg/pkg",
        json!({
            "packageJson": {
                "private": true
            }
        }),
    );
    let show = helper.native("show comp1 --legacy --json");
    assert!(show.contains("private"));
}

#[test]
fn loading_defective_workflows_does_not_throw_on_status() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.copy_fixture_extensions("non-requireable-aspect");
    helper.add_component("non-requireable-aspect", "--id non-requireable-aspect");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/non-requireable-aspect", helper.scopes.remote),
        json!({}),
    );
    let status1 = helper.native("status");
    assert!(!status1.is_empty());

    helper.copy_fixture_extensions("extension-provider-error");
    helper.add_component("extension-provider-error", "--id extension-provider-error");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/extension-provider-error", helper.scopes.remote),
        json!({}),
    );
    let status2 = helper.native("status");
    assert!(!status2.is_empty());
}
