use super::install_ids;
use serde_json::json;

#[test]
fn installation_uses_changed_and_new_component_versions_once() {
    let result = json!({
        "components":[{"id":"s/a@abc"},{"id":"s/b@def"}],
        "addedComponents":["s/b@def","s/c@ghi"],
    });
    assert_eq!(install_ids(&result).unwrap(), ["s/a@abc", "s/b@def", "s/c@ghi"]);
    assert!(install_ids(&json!({"components":[],"addedComponents":[]})).unwrap().is_empty());
}
