use super::{deprecated, lane_readme_of};
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
