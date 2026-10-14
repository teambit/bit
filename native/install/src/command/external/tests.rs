use super::{disable_in_config, remove_postinstall_script};
use crate::jsonc::Document;
use serde_json::json;
use std::fs;

#[test]
fn disables_the_mode_in_the_config() {
    let mut document = Document::parse(
        r#"{
  "teambit.dependencies/dependency-resolver": { "externalPackageManager": true, "policy": {} },
  "teambit.workspace/workspace-config-files": {}
}"#,
    )
    .unwrap();
    disable_in_config(&mut document);
    let value = document.value();
    assert_eq!(
        value["teambit.dependencies/dependency-resolver"],
        json!({ "policy": {}, "rootComponent": true }),
    );
    assert_eq!(
        value["teambit.workspace/workspace-config-files"],
        json!({ "enableWorkspaceConfigWrite": true }),
    );
}

#[test]
fn removes_only_bits_postinstall_script() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("package.json");
    let ours = json!({ "name": "x", "scripts": { "postinstall": "bit link && bit compile && bit ws-config write" } });
    fs::write(&path, ours.to_string()).unwrap();
    remove_postinstall_script(root.path()).unwrap();
    let written: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(written, json!({ "name": "x" }));
    let theirs = json!({ "scripts": { "postinstall": "echo hi" } });
    fs::write(&path, theirs.to_string()).unwrap();
    remove_postinstall_script(root.path()).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), theirs.to_string());
}
