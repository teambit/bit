use super::{Input, State};
use serde_json::{Value, json};

fn select(distance: &Value, modified: bool) -> Value {
    let mut state = State::new(1).unwrap();
    let target = json!({"identity":"scope/alpha","version":"1.0.0"});
    let model = json!({"head":"a".repeat(40)});
    let version = json!({"extensions":[]});
    state
        .select(&Input {
            index: 0,
            target: &target,
            model: Some(&model),
            incoming: &version,
            current: &version,
            modified,
            distance,
        })
        .unwrap()
}

#[test]
fn divergent_and_fast_forward_decisions_use_canonical_status_kernel() {
    let divergent = json!({"sourceOnly":["a".repeat(40)],"targetOnly":["b".repeat(40)],"common":"c".repeat(40),"noCommon":false});
    assert_eq!(select(&divergent, false), json!({"action":"merge","shouldBeRemoved":false}));
    assert_eq!(
        select(&json!({"sourceOnly":[],"targetOnly":["b".repeat(40)],"noCommon":false}), false),
        json!({"action":"target","shouldBeRemoved":false}),
    );
}

#[test]
fn modified_component_is_rejected_before_retained_body_preparation() {
    assert_eq!(
        select(&json!({}), true),
        json!({"action":"unchanged","message":"component is modified, please snap/tag it first","legitimate":false}),
    );
}

#[test]
fn optional_dependency_package_name_does_not_change_policy() {
    let base = json!([{"id":{"scope":"scope","name":"dep","version":"1.0.0"},"relativePaths":[]}]);
    let mut current = base.clone();
    current[0]["packageName"] = json!("@scope/dep");
    assert!(super::bodies::equivalent_dependencies(&base, &current).is_ok());
    let mut wrong = current.clone();
    wrong[0]["packageName"] = json!("@other/dep");
    assert!(super::bodies::equivalent_dependencies(&wrong, &current).is_err());
    wrong = base;
    wrong[0]["id"]["version"] = json!("2.0.0");
    assert!(super::bodies::equivalent_dependencies(&wrong, &current).is_err());
}
