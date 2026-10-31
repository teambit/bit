use super::semver;
use serde_json::{Value, json};
use std::cmp::Ordering;

fn version(prerelease: Value) -> Value {
    let mut result = json!({"major":1,"minor":2,"patch":3});
    result["prerelease"] = prerelease;
    result
}
#[test]
fn prerelease_numeric_identifiers_match_npm_number_coercion() {
    assert_eq!(
        semver::compare(
            &version(json!(["9007199254740993"])),
            &version(json!(["9007199254740992"]))
        )
        .unwrap(),
        Ordering::Equal,
    );
    assert_eq!(
        semver::compare(&version(json!([10])), &version(json!(["alpha"]))).unwrap(),
        Ordering::Less,
    );
    assert_eq!(
        semver::compare(&version(json!([])), &version(json!(["alpha"]))).unwrap(),
        Ordering::Greater,
    );
}
#[test]
fn range_excludes_prerelease_without_same_core_explicit_comparator() {
    let candidate = version(json!(["beta", 1]));
    let lower = json!({"major":0,"minor":0,"patch":0,"prerelease":[]});
    let mut input = json!({"candidate":{"version":candidate},"range":{"range":[[{"operator":">=","version":lower}]]}});
    assert!(!semver::satisfies(&input, "candidate", "range").unwrap());
    input["range"]["range"][0]
        .as_array_mut()
        .unwrap()
        .push(json!({"operator":">=","version":version(json!(["alpha"]))}));
    assert!(semver::satisfies(&input, "candidate", "range").unwrap());
}
#[test]
fn ranges_or_sets_and_any_comparator_preserve_npm_gate() {
    let input = json!({"stable":{"version":version(json!([]))},"pre":{"version":version(json!(["alpha"]))},"range":{"range":[[{"operator":""}]]}});
    assert!(semver::satisfies(&input, "stable", "range").unwrap());
    assert!(!semver::satisfies(&input, "pre", "range").unwrap());
    assert!(!semver::satisfies(&input, "invalid", "range").unwrap());
}
#[test]
fn structural_data_equality_ignores_object_order_with_preserved_serialization() {
    let left: Value = serde_json::from_str(r#"{"first":1,"second":[true,null]}"#).unwrap();
    let right: Value = serde_json::from_str(r#"{"second":[true,null],"first":1}"#).unwrap();
    assert_eq!(left, right);
    assert_ne!(serde_json::to_string(&left).unwrap(), serde_json::to_string(&right).unwrap());
}

fn sample_aspect_entries() -> Value {
    let env_ext = json!({
        "name": "teambit.envs/envs",
        "stringId": "teambit.envs/envs",
        "idWithoutVersion": "teambit.envs/envs",
        "config": {"env": "teambit.harmony/node"},
        "configJson": r#"{"env":"teambit.harmony/node"}"#,
        "configPretty": r#"{"env":"teambit.harmony/node"}"#,
        "data": {"id": "teambit.harmony/node"},
        "specific": false,
    });
    let dep_ext = json!({
        "name": "teambit.dependencies/dependency-resolver",
        "stringId": "teambit.dependencies/dependency-resolver",
        "idWithoutVersion": "teambit.dependencies/dependency-resolver",
        "config": {"policy": {"dependencies": {"@scope/pkg": "1.0.0"}}},
        "configJson": r#"{"policy":{"dependencies":{"@scope/pkg":"1.0.0"}}}"#,
        "configPretty": r#"{"policy":{"dependencies":{"@scope/pkg":"1.0.0"}}}"#,
        "data": {"dependencies": [{"__type": "component", "componentId": "scope/pkg@1.0.0", "id": "scope/pkg@1.0.0", "packageName": "@scope/pkg", "version": "1.0.0", "lifecycle": "runtime", "source": "auto"}]},
        "specific": false,
    });
    json!([env_ext, dep_ext])
}

#[test]
fn config_component_matches_aspect_entries_with_string_or_scoped_component_id() {
    let entries = sample_aspect_entries();
    let input = json!({
        "compIdStr": "scope/ui/button",
        "current": entries,
        "base": entries,
        "other": entries,
        "coreNames": ["teambit.envs/envs", "teambit.dependencies/dependency-resolver"],
        "workspaceIds": [{"base": "scope/pkg", "legacy": "scope/pkg@1.0.0"}],
        "otherLaneIds": [],
        "strategy": null,
        "currentLabel": "1.0.0",
        "otherLabel": "2.0.0",
        "semver": {},
        "shouldMergeAspectsData": false,
    });
    let result = super::apply("configComponent", &input).unwrap();
    assert!(result["configRows"].is_array());
}
