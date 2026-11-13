//! Unit tests for merge preflight [`validate_target`] file validation and dependent rejection.
//!
//! Confirms that application files via [`validate_target`] ([`incoming_fast_forward_application_files_decline_before_autosnap_allocation`]) and dependencies awaiting future snapshot replacement ([`preflight_only_rejects_dependencies_requiring_future_snapshot_replacement`]) decline during preflight.

use super::validate_target;
use serde_json::json;

/// Verifies that [`validate_target`] declines incoming application files (`.bit-app.ts`, `.node-app.js`, `.react-app.mjs`) before autosnap allocation.
#[test]
fn incoming_fast_forward_application_files_decline_before_autosnap_allocation() {
    for path in ["apps/new.bit-app.ts", "server.node-app.js", "client.react-app.mjs"] {
        assert!(validate_target(&json!({"files":[{"relativePath":path}]})).is_err());
    }
    assert!(validate_target(&json!({"files":[{"relativePath":"index.js"}]})).is_ok());
}

/// Verifies that preflight dependent rejection only declines dependencies that require future snapshot replacement ([`json`], [`validate_target`]).
#[test]
fn preflight_only_rejects_dependencies_requiring_future_snapshot_replacement() {
    let snapshots = std::collections::HashSet::from(["scope/pending"]);
    let mut version = serde_json::json!({"dependencies":[{"id":{"scope":"scope","name":"fixed","version":"2.0.0"}}],"devDependencies":[]});
    assert!(super::reject_dependents(&version, &snapshots).is_ok());
    version["dependencies"][0]["id"]["name"] = serde_json::json!("pending");
    assert!(super::reject_dependents(&version, &snapshots).is_err());
}
