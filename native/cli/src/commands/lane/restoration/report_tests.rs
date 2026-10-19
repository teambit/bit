use super::{merge, project};
use crate::commands::color::Chalk;
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
        Chalk::new(false),
    ).unwrap();
    assert_eq!(
        result,
        json!({"components":[],"mergeSnapResults":null,
        "workspaceConfigUpdateResult":{"logs":["policy"]},"historyId":"exact-key"}),
    );
}

const FILE_STATUSES: [(&str, &str, &str); 10] = [
    ("merged", "auto-merged", "32"),
    ("manual", "CONFLICT", "31"),
    ("binaryConflict", "unchanged-BINARY-CONFLICT", "31"),
    ("updated", "updated", "32"),
    ("added", "added", "32"),
    ("removed", "removed", "32"),
    ("unchanged", "unchanged", "32"),
    ("overridden", "overridden", "33"),
    ("remainDeleted", "remain-deleted", "32"),
    ("deletedConflict", "CONFLICT-deleted-and-modified", "31"),
];

fn file_statuses(projected: bool, colored: bool) -> serde_json::Value {
    let rows = FILE_STATUSES
        .into_iter()
        .map(|(status, label, code)| {
            let value = if !projected {
                status.to_owned()
            } else if colored {
                format!("\u{1b}[{code}m{label}\u{1b}[39m")
            } else {
                label.to_owned()
            };
            (format!("nested/{status}.js"), json!(value))
        })
        .collect::<serde_json::Map<_, _>>();
    serde_json::Value::Object(rows)
}

#[test]
fn all_released_file_statuses_project_in_both_collections_and_color_modes() {
    let statuses = file_statuses(false, false);
    let input = json!({
        "components":[{"id":"scope/changed@head","filesStatus":statuses,"retained":true}],
        "abortedComponents":[{"id":"scope/aborted@head","filesStatus":statuses,"reason":"kept"}],
        "failedComponents":[{"id":"scope/skipped@head","unchangedMessage":"already current"}],
        "addedComponents":["scope/new@head"],"ignoredTopLevel":"omitted",
    });
    let before = input.clone();
    for colored in [false, true] {
        let statuses = file_statuses(true, colored);
        let expected = json!({
            "components":[{"id":"scope/changed@head","filesStatus":statuses,"retained":true}],
            "abortedComponents":[{"id":"scope/aborted@head","filesStatus":statuses,"reason":"kept"}],
            "failedComponents":[{"id":"scope/skipped@head","unchangedMessage":"already current"}],
            "addedComponents":["scope/new@head"],"mergeSnapResults":null,"historyId":"exact-history",
        });
        assert_eq!(project(&input, "exact-history", Chalk::new(colored)).unwrap(), expected);
        assert_eq!(input, before);
    }
}

#[test]
fn explicit_null_and_missing_component_status_maps_are_preserved() {
    let input = json!({"components":[{"id":"scope/absent"},{"id":"scope/null","filesStatus":null}],
        "abortedComponents":null,"mergeSnapResults":null,"installationError":null});
    let before = input.clone();
    for colored in [false, true] {
        assert_eq!(
            project(&input, "key", Chalk::new(colored)).unwrap(),
            json!({"components":[{"id":"scope/absent"},{"id":"scope/null","filesStatus":null}],
                "abortedComponents":null,"mergeSnapResults":null,"installationError":null,"historyId":"key"}),
        );
        assert_eq!(input, before);
    }
}

#[test]
fn unrecognized_or_non_string_file_statuses_fail_without_mutating_input() {
    for collection in ["components", "abortedComponents"] {
        for status in [json!("not-a-released-status"), json!(null), json!(42)] {
            let input = json!({collection:[{"id":"scope/component@head","filesStatus":{"index.js":status}}]});
            let before = input.clone();
            for colored in [false, true] {
                assert!(project(&input, "key", Chalk::new(colored)).is_err());
                assert_eq!(input, before);
            }
        }
    }
}
