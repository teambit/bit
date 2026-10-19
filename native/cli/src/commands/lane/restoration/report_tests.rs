use super::{merge, project};
use serde_json::json;

#[test]
fn restored_partition_only_concatenates_changed_and_added_components() {
    let mut first = json!({"components":[{"id":"scope/existing@new"}],"addedComponents":[],
        "installationError":"first install","failedComponents":[{"id":"scope/unchanged@new"}],
        "workspaceConfigUpdateResult":{"logs":["first policy"]}});
    let second = json!({"components":[{"id":"scope/restored@old"}],"addedComponents":["scope/restored@old"],
        "installationError":"second install","compilationError":"second compiler",
        "failedComponents":[{"id":"scope/ignored@old"}],
        "workspaceConfigUpdateResult":{"logs":["second policy"]}});
    merge(&mut first, &second).unwrap();
    assert_eq!(
        first,
        json!({"components":[{"id":"scope/existing@new"},{"id":"scope/restored@old"}],
        "addedComponents":["scope/restored@old"],"installationError":"first install",
        "failedComponents":[{"id":"scope/unchanged@new"}],
        "workspaceConfigUpdateResult":{"logs":["first policy"]}}),
    );
}

#[test]
fn json_keeps_absent_fields_absent_and_explicit_null_snapshot_result() {
    let result = project(
        &json!({"components":[],"workspaceConfigUpdateResult":{"logs":["policy"],"irrelevant":true}}),
        "exact-key",
    );
    assert_eq!(
        result,
        json!({"components":[],"mergeSnapResults":null,
        "workspaceConfigUpdateResult":{"logs":["policy"]},"historyId":"exact-key"}),
    );
}
