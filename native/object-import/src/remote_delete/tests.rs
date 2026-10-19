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
