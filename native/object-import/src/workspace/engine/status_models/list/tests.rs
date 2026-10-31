use super::{deprecated, lane_readme_of, parse_lane_heads};
use serde_json::json;

#[test]
fn reads_deprecation_and_lane_readmes_from_core_extensions() {
    let version = json!({"extensions": [
        {"name": "teambit.component/deprecation", "config": {"deprecate": true}},
        {"name": "teambit.lanes/lanes", "config": {"readme": {"dev": {}, "next": {}}}},
    ]});
    assert!(deprecated(&version));
    assert_eq!(lane_readme_of(&version).unwrap(), ["dev", "next"]);
    let plain = json!({"extensions": [
        {"name": "teambit.component/deprecation", "config": {"deprecate": false}},
        {"extensionId": {"scope": "s", "name": "teambit.lanes/lanes"}, "config": {"readme": {"x": {}}}},
    ]});
    assert!(!deprecated(&plain));
    assert!(lane_readme_of(&plain).unwrap().is_empty());
    let invalid =
        json!({"extensions": [{"name": "teambit.lanes/lanes", "config": {"readme": "x"}}]});
    assert!(lane_readme_of(&invalid).is_err());
}

#[test]
fn parse_lane_heads_supports_string_and_object_component_ids() {
    let hash_a = "a".repeat(40);
    let hash_b = "b".repeat(40);
    let lane = json!({
        "components": [
            {"id": {"scope": "demo.scope", "name": "ui/button"}, "head": hash_a},
            {"id": "other.scope/ui/card@0.0.1", "head": hash_b},
            {"id": "unscoped/item", "head": hash_a, "isHidden": true},
        ]
    });
    let heads = parse_lane_heads(&lane, "lane.scope").unwrap();
    assert_eq!(heads.get("demo.scope/ui/button"), Some(&hash_a));
    assert_eq!(heads.get("other.scope/ui/card"), Some(&hash_b));
    assert_eq!(heads.len(), 2);
}
