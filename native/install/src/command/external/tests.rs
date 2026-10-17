use super::{disable_in_config, remove_postinstall_script, write_package_json_dependencies};
use crate::{jsonc::Document, model::DependencyMap};
use serde_json::json;
use std::fs;

fn dependencies(entries: &[(&str, &str)]) -> DependencyMap {
    entries
        .iter()
        .map(|(name, range)| ((*name).to_string(), (*range).to_string()))
        .collect()
}

#[test]
fn writes_dependencies_into_the_root_package_json() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("package.json");
    fs::write(
        &path,
        "{\r\n    \"name\": \"ws\",\r\n    \"dependencies\": {\r\n        \"lodash\": \"^3.0.0\",\r\n        \"chalk\": \"4.0.0\"\r\n    },\r\n    \"private\": true\r\n}",
    )
    .unwrap();
    write_package_json_dependencies(
        root.path(),
        &dependencies(&[("react", "^18.0.0"), ("lodash", "^4.17.0")]),
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "{\r\n    \"name\": \"ws\",\r\n    \"dependencies\": {\r\n        \"lodash\": \"^4.17.0\",\r\n        \"chalk\": \"4.0.0\",\r\n        \"react\": \"^18.0.0\"\r\n    },\r\n    \"private\": true\r\n}\r\n",
    );
}

#[test]
fn creates_the_package_json_and_its_dependencies() {
    let root = tempfile::tempdir().unwrap();
    write_package_json_dependencies(root.path(), &dependencies(&[("is-odd", "3.0.1")])).unwrap();
    let path = root.path().join("package.json");
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "{\n  \"dependencies\": {\n    \"is-odd\": \"3.0.1\"\n  }\n}\n",
    );
    fs::write(&path, r#"{"name":"ws","dependencies":null}"#).unwrap();
    write_package_json_dependencies(root.path(), &dependencies(&[("a", "1.0.0")])).unwrap();
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "{\n  \"name\": \"ws\",\n  \"dependencies\": {\n    \"a\": \"1.0.0\"\n  }\n}\n",
    );
    fs::write(&path, "{ invalid").unwrap();
    assert!(write_package_json_dependencies(root.path(), &DependencyMap::new()).is_err());
}

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
