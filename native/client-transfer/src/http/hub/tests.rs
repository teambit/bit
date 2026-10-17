use super::{HubReply, StatusCode, finish, line};
use serde_json::{Value, json};

#[test]
fn streamed_messages_keep_wire_order_and_last_terminal_result() {
    let mut end = Value::Null;
    let mut messages = Vec::new();
    for row in [
        json!({"message":"receiving objects"}),
        json!({"end":true,"data":{"successIds":[]},"message":"first result"}),
        json!({"message":"persisting scope"}),
        json!({"end":true,"data":{"successIds":["scope/a@1.0.0"]},"message":"done"}),
    ] {
        line(&serde_json::to_vec(&row).unwrap(), &mut end, &mut messages).unwrap();
    }
    let HubReply { data, messages } =
        finish("http://hub/api/put", StatusCode::OK, &end, messages).unwrap();
    assert_eq!(data["successIds"], json!(["scope/a@1.0.0"]));
    assert_eq!(messages, ["receiving objects", "first result", "persisting scope", "done"]);
}

#[test]
fn missing_terminal_data_and_server_failure_never_become_success() {
    let missing =
        finish("http://hub/api/put", StatusCode::OK, &Value::Null, Vec::new()).err().unwrap();
    assert_eq!(missing.to_string(), r#"HTTP results are missing "data" property"#);
    let failure = finish(
        "http://hub/api/put",
        StatusCode::BAD_GATEWAY,
        &json!({"data":{"isError":true},"message":"server detail"}),
        Vec::new(),
    )
    .err()
    .unwrap();
    assert!(failure.to_string().contains("server detail"));
    let mut end = Value::Null;
    assert!(line(b"{", &mut end, &mut Vec::new()).is_err());
}

#[test]
fn omitted_messages_retain_the_callers_loader_seed_then_the_last_wire_message() {
    let mut end = Value::Null;
    let mut messages = Vec::new();
    for row in [
        json!({"end":true,"data":{"successIds":[]}}),
        json!({"message":"persisting scope"}),
        json!({"end":true,"data":{"successIds":[]}}),
    ] {
        line(&serde_json::to_vec(&row).unwrap(), &mut end, &mut messages).unwrap();
    }
    assert_eq!(messages, ["", "persisting scope", "persisting scope"]);
}
