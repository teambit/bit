//! Unit tests for workspace `ignoreIssues` filtering during [`Component`] status issue [`collect`]ion.
//!
//! Verifies root-level and component-level `ignoreIssues` suppression of `MissingManuallyConfiguredPackages`.

use super::{Component, collect};
use serde_json::{Value, json};

/// Verifies root `ignoreIssues` settings suppress `MissingManuallyConfiguredPackages` during [`collect`].
#[test]
fn root_issue_setting_ignores_only_missing_manually_configured_packages() {
    let component = Component {
        ignored: Vec::new(),
        identity: "scope/alpha@1.0.0".into(),
        package_name: "@scope/alpha".into(),
        dependencies: vec![],
        issues: json!([{"type":"MissingManuallyConfiguredPackages","data":r#"["missing-pkg"]"#}]),
    };
    let mut context = json!({
        "versions":[],"models":[],"targets":[{"identity":"scope/alpha","directory":"."}],
        "workspace":{"teambit.dependencies/dependency-resolver":{"rootComponents":false}},
        "packageJson":{},
    });
    let root = std::env::temp_dir().join("bit-ignored-manual-issue-test");
    let plain = collect(&root, &context, std::slice::from_ref(&component)).unwrap().unwrap();
    let plain_issues = plain[0]["issues"].as_array().unwrap();
    assert!(
        plain_issues
            .iter()
            .any(|issue| issue["type"] == "MissingManuallyConfiguredPackages"),
    );
    context["workspace"]["teambit.component/issues"] =
        json!({"ignoreIssues":["MissingManuallyConfiguredPackages"]});
    let ignored = collect(&root, &context, &[component]).unwrap().unwrap();
    let ignored_issues = ignored[0]["issues"].as_array().unwrap();
    assert!(
        ignored_issues
            .iter()
            .all(|issue| issue["type"] != "MissingManuallyConfiguredPackages"),
    );
    assert!(ignored_issues.iter().all(Value::is_object));
}

/// Verifies that [`collect`] returns `Some(Vec::new())` when given an empty [`Component`] slice.
///
/// Ensures empty workspace component sets produce an empty issue list without errors.
#[test]
fn collect_with_empty_components_slice_returns_empty_vec() {
    let context = json!({"versions":[],"models":[],"targets":[],"workspace":{},"packageJson":{}});
    let root = std::env::temp_dir().join("bit-empty-issue-test");
    assert_eq!(collect(&root, &context, &[]).unwrap(), Some(Vec::new()));
}
