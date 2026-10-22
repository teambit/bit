//! `e2e/harmony/workspace-config.e2e.ts`.

use crate::helper::{Helper, config};
use serde_json::json;
use std::fs;

/// workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should preserve comments above the workspace aspect
/// workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should preserve comments inside the workspace aspect object
/// workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should update the defaultScope value
/// workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should not lose any other properties
#[test]
fn comment_preservation_in_workspace_jsonc() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let workspace_jsonc_with_comments = r#"{
  "$schema": "./workspace-jsonc-schema.json",
  // Default scope for all components in workspace.
  "teambit.workspace/workspace": {
    // This is the workspace name
    "name": "test-workspace",
    // This is the default scope
    "defaultScope": "old.scope"
  }
}"#;
    helper.output_file("workspace.jsonc", workspace_jsonc_with_comments);
    helper.native("scope set new.scope");

    let after = fs::read_to_string(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    assert!(after.contains("// Default scope for all components in workspace."), "{after}");
    assert!(after.contains("// This is the workspace name"), "{after}");
    assert!(after.contains("// This is the default scope"), "{after}");
    assert!(after.contains(r#""defaultScope": "new.scope""#), "{after}");
    assert!(after.contains(r#""name": "test-workspace""#), "{after}");
}

/// workspace config (workspace.jsonc) › adding a non-component key › any command should throw a descriptive error
#[test]
fn adding_a_non_component_key() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    config::set_workspace_key(&helper.scopes.local_path, "non-comp", json!({}));

    let run = helper.native_run("status");
    assert!(!run.status.success());
    let output = format!("{}{}", run.stdout, run.stderr);
    assert!(
        output.contains(
            r#"unable to parse the component-id "non-comp" from the workspace.jsonc file"#
        ),
        "{output}",
    );
}

/// workspace config (workspace.jsonc) › adding a non-existing component to a variant › any command should throw a `ComponentNotFound` error with specific suggestions for the workspace.jsonc file
#[test]
fn adding_a_non_existing_component_to_a_variant() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.native("add comp1");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({ "*": { "teambit.harmony/non-exist": {} } }),
    );

    let run = helper.native_run("status");
    assert!(!run.status.success());
    let output = format!("{}{}", run.stdout, run.stderr);
    assert!(output.contains("your workspace.jsonc has this component-id set"), "{output}");
}
