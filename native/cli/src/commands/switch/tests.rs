use super::installation::component_ids;
use serde_json::json;

#[test]
fn installation_uses_changed_and_new_component_versions_once() {
    let result = json!({
        "components":[{"id":"s/a@abc"},{"id":"s/b@def"}],
        "addedComponents":["s/b@def","s/c@ghi"],
    });
    assert_eq!(component_ids(&result).unwrap(), ["s/a@abc", "s/b@def", "s/c@ghi"]);
    assert!(component_ids(&json!({"components":[],"addedComponents":[]})).unwrap().is_empty());
}
