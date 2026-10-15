use super::Request;

#[test]
fn component_log_request_decodes() {
    let input = serde_json::json!({"kind":"componentLog","root":"/tmp","identity":"s/a"});
    let result = serde_json::from_value::<Request>(input);
    assert!(result.is_ok(), "{:?}", result.err());
}
