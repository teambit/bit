use super::{Baseline, Prepared, Row, activate_inactive};
use serde_json::{Value, json};

fn row(identity: &str, ours_conflict: bool) -> Row {
    Row {
        identity: identity.into(),
        baseline: Baseline {
            directory: identity.into(),
            version: "1.0.0".into(),
            current: Value::Null,
            versions: [Value::Null, Value::Null, Value::Null],
            package_name: identity.into(),
        },
        files: Vec::new(),
        merged: json!({}),
        projected: Value::Null,
        ours_conflict,
        fast_forward: false,
        detected: None,
    }
}

#[test]
fn projected_workspace_activates_written_inactive_targets_without_excluded_or_keep_ours_rows() {
    let mut context = json!({"targets":[{"identity":"scope/active"}],"lane":{"inactiveTargets":[
        {"identity":"scope/written","directory":"written","version":"1.0.0"},
        {"identity":"scope/excluded","directory":"excluded"},
        {"identity":"scope/ours","directory":"ours"}
    ],"addedTargets":[{"identity":"scope/new","directory":"new","version":"2.0.0"}]}});
    let mut policy = Prepared::new();
    policy.rows =
        vec![row("scope/written", false), row("scope/ours", true), row("scope/new", false)];
    assert_eq!(super::workspace_count(&context, Some(&policy)).unwrap(), 3);
    activate_inactive(&policy, &mut context).unwrap();
    activate_inactive(&policy, &mut context).unwrap();
    assert_eq!(
        context["targets"],
        json!([
            {"identity":"scope/active"},
            {"identity":"scope/written","directory":"written","version":"1.0.0"},
            {"identity":"scope/new","directory":"new","version":"2.0.0"}
        ]),
    );
}
