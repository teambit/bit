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
        },
        files: Vec::new(),
        merged: json!({}),
        projected: json!({}),
        ours_conflict: false,
        fast_forward,
        detected: None,
    }
}

#[test]
fn snap_issue_receipt_preserves_visible_identity_and_serialized_packages() {
    let issues = json!([{"type":"MissingManuallyConfiguredPackages","data":r#"["@types/node","@types/jest"]"#}]);
    let mut output = Vec::new();
    capture_issues(&row(true), &issues, &mut output).unwrap();
    assert!(output.is_empty());
    capture_issues(&row(false), &issues, &mut output).unwrap();
    assert_eq!(output, vec![json!({"id":"scope/component@1.0.0","issues":issues})]);
    assert!(
        capture_issues(&row(false), &json!([{"type":"OtherIssue","data":"[]"}]), &mut output)
            .is_err(),
    );
    assert!(
        capture_issues(
            &row(false),
            &json!([{"type":"MissingManuallyConfiguredPackages","data":"{}"}]),
            &mut output
        )
        .is_err(),
    );
}

#[test]
fn issue_projection_uses_final_native_state_in_lifecycle_order() {
    let state = json!({"components":[[1],[0],[]],"entries":[{"identity":"scope/dev@2.0.0"},{"identity":"scope/runtime@1.0.0"}]});
    let issues = json!([{"type":"MissingManuallyConfiguredPackages","data":r#"["@types/node"]"#}]);
    assert_eq!(
        super::issues::target(&row(false), &state, &issues).unwrap(),
        json!({
            "identity":"scope/component@1.0.0","packageName":"@scope/component",
            "dependencies":["scope/runtime@1.0.0","scope/dev@2.0.0"],"issues":issues
        }),
    );
}
