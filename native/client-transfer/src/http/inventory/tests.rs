use super::list_variables;
use serde_json::json;

#[test]
fn omitted_namespace_is_not_serialized_as_null() {
    assert_eq!(list_variables(None, false), json!({}));
    assert_eq!(list_variables(None, true), json!({"includeDeleted":true}));
    assert_eq!(list_variables(Some("ui/**"), false), json!({"namespaces":["ui/**"]}));
}
