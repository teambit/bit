use super::current_dependencies;
use serde_json::json;

#[test]
fn resolved_class_dependencies_override_empty_legacy_metadata_and_explicit_empty_is_authoritative()
{
    let mut row = json!({"current":{"dependencies":[],"devDependencies":[]},
        "resolvedDependencies":[{"componentId":{"scope":"scope","name":"actual","version":"1.2.3"},"lifecycle":"runtime"}]});
    let actual = current_dependencies(&row).unwrap();
    assert_eq!(actual.len(), 1);
    assert_eq!(actual[0].name, "actual");
    assert_eq!(actual[0].version, "1.2.3");
    row["current"]["dependencies"] =
        json!([{"id":{"scope":"scope","name":"legacy","version":"9.0.0"}}]);
    row["resolvedDependencies"] = json!([]);
    assert!(current_dependencies(&row).unwrap().is_empty());
    row["resolvedDependencies"] = json!({});
    assert!(current_dependencies(&row).is_err());
}
