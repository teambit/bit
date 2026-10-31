use super::ScopeGuard;
use std::fs;

#[test]
fn custom_scope_and_late_metadata_changes_are_rejected_before_file_delete() {
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("scope.json");
    fs::write(&config, br#"{"name":"remote","remotes":{}}"#).unwrap();
    let guard = ScopeGuard::prepare(root.path()).unwrap();
    fs::write(root.path().join("scope.jsonc"), br#"{"custom/extension":{}}"#).unwrap();
    assert!(guard.validate().is_err());
    assert!(ScopeGuard::prepare(root.path()).is_err());
    fs::remove_file(root.path().join("scope.jsonc")).unwrap();
    fs::write(&config, br#"{"name":"remote","hooksPath":"./hooks.js"}"#).unwrap();
    assert!(ScopeGuard::prepare(root.path()).is_err());
}

#[test]
fn scope_guard_accepts_jsonc_and_component_row_matches_string_ids() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("scope.json"), b"// comment\n{\"name\":\"remote\",\"remotes\":{},}")
        .unwrap();
    assert!(ScopeGuard::prepare(root.path()).is_ok());
    let index = serde_json::json!({
        "components": [{"id": "demo.scope/ui/btn", "isSymlink": false, "hash": "0123456789abcdef0123456789abcdef01234567"}]
    });
    assert!(super::component_row(&index, "demo.scope/ui/btn").is_some());
}
