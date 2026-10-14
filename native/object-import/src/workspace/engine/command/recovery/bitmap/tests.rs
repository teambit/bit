use super::project;
use serde_json::json;
#[test]
fn keeps_bitmap_policy_separate_from_structural_target() {
    let original = json!({"component":{"rootDir":"component","config":{"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":{"pkg":"1.0.0"}}}}}});
    let (projected, configs) = project(&original).unwrap();
    assert!(projected["component"].get("config").is_none());
    assert_eq!(configs["component"], original["component"]["config"]);
    assert!(original["component"].get("config").is_some());
}
#[test]
fn rejects_custom_providers_and_removed_aspects() {
    for config in [
        json!({"custom/aspect":{}}),
        json!({"teambit.pkg/pkg":"-"}),
        json!({"teambit.envs/envs":{"env":"custom/env"}}),
    ] {
        assert!(project(&json!({"component":{"rootDir":"component","config":config}})).is_err());
    }
}
