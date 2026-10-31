use super::{
    super::{Baseline, Row},
    capture_issues,
};
use serde_json::{Value, json};

fn row(fast_forward: bool) -> Row {
    Row {
        identity: "scope/component".into(),
        baseline: Baseline {
            directory: "component".into(),
            version: "1.0.0".into(),
            current: json!({}),
            versions: [Value::Null, Value::Null, Value::Null],
            package_name: "@scope/component".into(),
            scope_only: false,
        },
        files: Vec::new(),
        merged: json!({}),
        projected: json!({}),
        ours_conflict: false,
        fast_forward,
        receipts: super::super::Receipts::default(),
    }
}

#[test]
fn an_ignored_issue_does_not_block_the_snap() {
    let issues = json!([
        {"type":"MissingManuallyConfiguredPackages","data":r#"["@types/node"]"#},
        {"type":"OtherIssue","data":"[]"},
    ]);
    let ignored = ["MissingManuallyConfiguredPackages".into(), "OtherIssue".into()];
    let mut output = Vec::new();
    capture_issues(&row(false), &issues, &ignored, &mut output).unwrap();
    assert!(output.is_empty());
}

#[test]
fn snap_issue_receipt_preserves_visible_identity_and_serialized_packages() {
    let issues = json!([{"type":"MissingManuallyConfiguredPackages","data":r#"["@types/node","@types/jest"]"#}]);
    let mut output = Vec::new();
    capture_issues(&row(true), &issues, &[], &mut output).unwrap();
    assert!(output.is_empty());
    capture_issues(&row(false), &issues, &[], &mut output).unwrap();
    assert_eq!(output, vec![json!({"id":"scope/component@1.0.0","issues":issues})]);
    assert!(
        capture_issues(&row(false), &json!([{"type":"OtherIssue","data":"[]"}]), &[], &mut output)
            .is_err(),
    );
    assert!(
        capture_issues(
            &row(false),
            &json!([{"type":"MissingManuallyConfiguredPackages","data":"{}"}]),
            &[],
            &mut output
        )
        .is_err(),
    );
}

#[test]
fn issue_projection_uses_final_native_state_in_lifecycle_order() {
    let state = json!({"components":[[1],[0],[]],"entries":[{"identity":"scope/dev@2.0.0"},{"id":"scope/runtime@1.0.0"}]});
    let issues = json!([{"type":"MissingManuallyConfiguredPackages","data":["@types/node"]}]);
    let mut captured = Vec::new();
    capture_issues(&row(false), &issues, &[], &mut captured).unwrap();
    assert_eq!(captured.len(), 1);
    assert_eq!(
        super::issues::target(&row(false), &state, &issues).unwrap(),
        json!({
            "identity":"scope/component@1.0.0","packageName":"@scope/component",
            "dependencies":["scope/runtime@1.0.0","scope/dev@2.0.0"],"issues":issues
        }),
    );
}

#[test]
fn fixed_fast_forward_dependency_is_not_a_pending_snapshot_cascade() {
    let rows = [cascade_row("scope/ff", true), cascade_row("scope/snapshot", false)];
    let pending = super::snapshot_identities(&rows);
    let dependency = json!({"identity":"scope/ff@2.0.0","packageName":"@scope/ff"});
    assert_eq!(super::component(&dependency, &pending).unwrap()["id"]["version"], "2.0.0");
    assert!(super::component(&json!({"identity":"scope/snapshot@1.0.0"}), &pending).is_err());
}

fn cascade_row(identity: &str, fast_forward: bool) -> super::super::Row {
    super::super::Row {
        identity: identity.into(),
        baseline: super::super::Baseline {
            directory: String::new(),
            version: String::new(),
            current: serde_json::Value::Null,
            versions: [serde_json::Value::Null, serde_json::Value::Null, serde_json::Value::Null],
            package_name: String::new(),
            scope_only: false,
        },
        files: Vec::new(),
        merged: json!({}),
        projected: serde_json::Value::Null,
        ours_conflict: false,
        fast_forward,
        receipts: super::super::Receipts::default(),
    }
}
