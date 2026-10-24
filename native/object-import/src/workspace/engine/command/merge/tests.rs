use super::{Input, State};
use serde_json::{Value, json};

fn select(distance: &Value, modified: bool) -> Value {
    select_options(distance, modified, false)
}

fn select_options(distance: &Value, modified: bool, target_as_diverged: bool) -> Value {
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
            options: super::SelectionOptions {
                modified,
                target_as_diverged,
                resolve_unrelated: None,
            },
            lane: None,
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

#[test]
fn mixed_harmony_schemas_allow_policy_projection_but_guard_other_metadata() {
    use crate::workspace::engine::status_models::harmony;
    let old = json!({"schema":"1.0.0","mainFile":"index.js","docs":[]});
    let mut new = old.clone();
    new["schema"] = json!("2.0.0");
    new["packageDependencies"] = json!({});
    let mut sides = vec![
        harmony::project(&old).unwrap(),
        harmony::project(&new).unwrap(),
        harmony::project(&old).unwrap(),
    ];
    assert!(super::bodies::metadata_guard(&sides).is_ok());
    sides[2]["packageDependencies"] = json!({"changed":"1.0.0"});
    assert!(super::bodies::metadata_guard(&sides).is_ok());
    sides[2]["mainFile"] = json!("changed.js");
    assert!(super::bodies::metadata_guard(&sides).is_err());
}

#[test]
fn lane_no_snap_keeps_fast_forward_pending_when_a_common_version_exists() {
    let distance = json!({"sourceOnly":[],"targetOnly":["b".repeat(40)],"common":"a".repeat(40),"noCommon":false});
    assert_eq!(select_options(&distance, false, true)["action"], "merge");
    assert_eq!(select_options(&distance, false, false)["action"], "target");
    let no_common = json!({"sourceOnly":[],"targetOnly":["b".repeat(40)],"noCommon":false});
    assert_eq!(select_options(&no_common, false, true)["action"], "target");
}
