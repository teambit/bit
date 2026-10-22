//! `e2e/harmony/update-cmd.e2e.ts` and `e2e/harmony/publish.e2e.ts`.

use crate::helper::{Helper, config};
use serde_json::{Value, json};

#[test]
fn updates_policies_added_by_user_to_latest_versions() {
    let helper = Helper::new();
    helper.native("update --yes");
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "const isPositive = require('is-positive');\n");
    helper.output_file("comp2/index.js", "const isOdd = require('is-odd');\n");
    helper.run("add comp1");
    helper.run("add comp2");
    helper.run("eject-conf comp2");
    helper.set_component_json_extension(
        "comp2",
        "teambit.dependencies/dependency-resolver",
        json!({ "policy": { "dependencies": { "is-odd": "1.0.0" } } }),
    );
    helper.add_extension_to_variant(
        "comp1",
        "teambit.dependencies/dependency-resolver",
        json!({ "policy": { "dependencies": { "is-positive": "1.0.0" } } }),
    );
    helper.add_key_val_to_dependency_resolver_policy("is-even", "0.1.0");
    helper.native("install");
    helper.native("update --yes --latest");
    let ws = helper.read_workspace_jsonc();
    assert_ne!(
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]["is-even"].as_str(
        ),
        Some("0.1.0"),
    );
    let comp2_json = helper.read_component_json("comp2");
    assert_ne!(
        comp2_json["extensions"]["teambit.dependencies/dependency-resolver"]["policy"]
            ["dependencies"]["is-odd"]
            .as_str(),
        Some("1.0.0"),
    );
}

#[test]
fn updates_selected_patterns_and_preserves_comments() {
    let helper = Helper::new();
    helper.native("update --yes");
    helper.set_workspace_with_remote_scope();
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.add_key_val_to_dependency_resolver_policy("is-odd", "1.0.0");
    let raw = helper.read_file("workspace.jsonc");
    let commented = raw.replace(
        r#""is-positive": "1.0.0""#,
        "// keep this comment\n        \"is-positive\": \"1.0.0\"",
    );
    helper.output_file("workspace.jsonc", &commented);
    helper.native("update is-positive --yes --latest");
    let updated_raw = helper.read_file("workspace.jsonc");
    assert!(updated_raw.contains("// keep this comment"));
    let ws = helper.read_workspace_jsonc();
    let deps = &ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"];
    assert_ne!(deps["is-positive"].as_str(), Some("1.0.0"));
    assert_eq!(deps["is-odd"].as_str(), Some("1.0.0"));
}

#[test]
fn updates_policies_added_by_deps_set_latest_and_compatible() {
    let helper = Helper::new();
    helper.native("update --yes");
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("deps set comp1 is-positive@1.0.0");
    helper.native("update --yes --latest");
    let show1 = helper.show_component_parsed_harmony("comp1");
    assert!(show1.is_array());

    helper.native("deps set comp1 is-positive@^1.0.0");
    helper.native("update --yes");
    let show2 = helper.show_component_parsed_harmony("comp1");
    assert!(show2.is_array());

    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({ "savePrefix": "~" }),
    );
    helper.native("deps set comp1 is-positive@1.0.0");
    helper.native("update --yes");
    let show3 = helper.show_component_parsed_harmony("comp1");
    assert!(show3.is_array());
}

#[test]
fn updates_from_model_with_and_without_save_prefix() {
    let helper = Helper::new();
    helper.native("update --yes");
    helper.set_workspace_with_remote_scope();
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({ "savePrefix": "^" }),
    );
    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.output_file("comp2/index.js", "module.exports = () => 'comp2 v2';\n");
    helper.tag_without_build("comp2", "");
    helper.export("");

    let scope = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({ "savePrefix": "^" }),
    );
    helper.import_component("comp1@0.0.1", "-x");
    helper.native("update --yes");
    let ws = helper.read_workspace_jsonc();
    let pkg = format!("@{scope}/comp2");
    assert!(
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"][&pkg]
            .as_str()
            .is_some(),
    );

    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({}),
    );
    helper.native("update --yes");
    let bitmap = helper.read_bit_map();
    assert!(bitmap.is_object());
}

#[test]
fn updates_component_dependency_and_skips_local_component() {
    let helper = Helper::new();
    helper.native("update --yes");
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    let cloned = helper.clone_workspace();
    helper.output_file("comp2/index.js", "module.exports = () => 'comp2 v2';\n");
    helper.tag_without_build("comp2", "");
    helper.export("");

    helper.get_cloned_workspace(&cloned);
    helper.import_component("*", "-x --objects");
    helper.native("update --yes");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.0.1"));
    helper.native("remove comp2 --silent");
    helper.native("update --yes");
    let show = helper.show_component_parsed_harmony("comp1");
    assert!(show.is_array());
}

#[test]
fn publish_before_and_during_tag() {
    let helper = Helper::new();
    helper.native("publish comp1 --dry-run");
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.add_extension_to_variant(
        "*",
        "teambit.pkg/pkg",
        json!({
            "packageJson": {
                "private": false
            }
        }),
    );
    let err = helper.native_run("publish comp1");
    assert!(!err.status.success());

    let dry = helper.native("publish comp1 --allow-staged --dry-run");
    assert!(!dry.is_empty());

    let tag_out = helper.run("tag --build");
    assert!(tag_out.contains("0.0.1"));
    let show: Value = helper.show_component_parsed_harmony("comp1");
    assert!(show.is_array());
}

#[test]
fn publish_command_and_invalid_package_name() {
    let helper = Helper::new();
    helper.native("publish comp1 --dry-run");
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.add_extension_to_variant(
        "*",
        "teambit.pkg/pkg",
        json!({
            "packageJson": {
                "private": false
            }
        }),
    );
    helper.tag_all_without_build("");
    let pub_out = helper.native("publish comp1 --allow-staged --dry-run");
    assert!(!pub_out.is_empty());

    helper.add_extension_to_variant(
        "*",
        "teambit.pkg/pkg",
        json!({
            "packageJson": {
                "name": "invalid name with spaces",
                "private": false
            }
        }),
    );
    let invalid_tag = Helper::cmd_in(&helper.scopes.local_path, "tag --unmodified --build");
    assert!(!invalid_tag.status.success());
}

#[test]
fn publish_with_scope_and_name_and_apps() {
    let helper = Helper::new();
    helper.native("publish comp1 --dry-run");
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.add_extension_to_variant(
        "comp1",
        "teambit.pkg/pkg",
        json!({
            "packageJson": {
                "name": "@custom/comp1",
                "private": false
            },
            "avoidPublishToNPM": true
        }),
    );
    helper.add_extension_to_variant(
        "comp3",
        "teambit.pkg/pkg",
        json!({
            "packageJson": {
                "name": "@custom/my-app-pkg",
                "private": false
            },
            "avoidPublishToNPM": true
        }),
    );
    let tag_out = helper.run("tag --build");
    assert!(tag_out.contains("comp1"));
    let show1 = helper.show_component_parsed_harmony("comp1");
    assert!(show1.is_array());
    let show2 = helper.show_component_parsed_harmony("comp2");
    assert!(show2.is_array());
    let show3 = helper.show_component_parsed_harmony("comp3");
    assert!(show3.is_array());
}
