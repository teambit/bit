use super::validate_target;
use serde_json::json;

#[test]
fn incoming_fast_forward_application_files_decline_before_autosnap_allocation() {
    for path in ["apps/new.bit-app.ts", "server.node-app.js", "client.react-app.mjs"] {
        assert!(validate_target(&json!({"files":[{"relativePath":path}]})).is_err());
    }
    assert!(validate_target(&json!({"files":[{"relativePath":"index.js"}]})).is_ok());
}
