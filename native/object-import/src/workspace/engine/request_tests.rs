use super::Request;

#[test]
fn component_log_request_decodes_on_main_and_lane() {
    for input in [
        serde_json::json!({"kind":"componentLog","root":"/tmp","identity":"s/a"}),
        serde_json::json!({"kind":"componentLog","root":"/tmp","identity":"s/a","lane":null}),
        serde_json::json!({"kind":"componentLog","root":"/tmp","identity":"s/a","lane":{"scope":"s","name":"study"}}),
    ] {
        let result = serde_json::from_value::<Request>(input);
        assert!(result.is_ok(), "{:?}", result.err());
    }
}
