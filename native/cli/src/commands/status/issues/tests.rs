use super::{Component, collect};
use serde_json::{Value, json};

#[test]
fn root_issue_setting_ignores_only_missing_manually_configured_packages() {
    let component = Component {
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
