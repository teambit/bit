use super::validate_target;
use serde_json::json;

#[test]
fn incoming_fast_forward_application_files_decline_before_autosnap_allocation() {
    for path in ["apps/new.bit-app.ts", "server.node-app.js", "client.react-app.mjs"] {
        assert!(validate_target(&json!({"files":[{"relativePath":path}]})).is_err());
    }
    assert!(validate_target(&json!({"files":[{"relativePath":"index.js"}]})).is_ok());
}

#[test]
fn preflight_only_rejects_dependencies_requiring_future_snapshot_replacement() {
    let snapshots = std::collections::HashSet::from(["scope/pending"]);
    let mut version = serde_json::json!({"dependencies":[{"id":{"scope":"scope","name":"fixed","version":"2.0.0"}}],"devDependencies":[]});
    assert!(super::reject_dependents(&version, &snapshots).is_ok());
    version["dependencies"][0]["id"]["name"] = serde_json::json!("pending");
    assert!(super::reject_dependents(&version, &snapshots).is_err());
}
