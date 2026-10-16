use super::super::Issue;
use serde_json::Value;

/// Captured from the released `@teambit/component-issues` 2.2.94 classes,
/// including their `deserialize`, `toObject` and `dataToString` methods.
#[test]
fn detection_issue_objects_match_released_node_classes() {
    let fixtures: Vec<Value> = serde_json::from_str(include_str!("oracle.json")).unwrap();
    for fixture in fixtures {
        let kind = Issue::parse(fixture["type"].as_str().unwrap()).unwrap();
        let Issue::Detected(detected) = kind else { panic!("detection issue expected") };
        let data = detected
            .deserialize(fixture["data"].clone())
            .unwrap();
        let actual = kind.to_object(&data).unwrap();
        assert_eq!(actual, fixture["expected"], "{}", fixture["type"]);
    }
}
