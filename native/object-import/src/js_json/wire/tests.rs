use super::Value;
use serde_json::json;
#[test]
fn compact_and_legacy_strings_have_identical_javascript_serialization() {
    let compact = json!({"kind":"object", "value":[
        ["10", {"kind":"string", "value":"Unicode Ω🌱\u{0000}\r\n"}],
        [[0xd800], {"kind":"string", "value":[0xdfff]}],
        ["2", {"kind":"number", "value":"8000000000000000"}],
    ]});
    let value: Value = serde_json::from_value(compact).unwrap();
    let legacy = serde_json::to_value(&value).unwrap();
    assert!(legacy["value"][0][0].is_array());
    let decoded: Value = serde_json::from_value(legacy).unwrap();
    let bytes = crate::js_json::stringify(&value, false).unwrap().unwrap();
    assert_eq!(bytes, crate::js_json::stringify(&decoded, false).unwrap().unwrap());
    assert_eq!(
        String::from_utf8(bytes).unwrap(),
        r#"{"2":0,"10":"Unicode Ω🌱\u0000\r\n","\ud800":"\udfff"}"#,
    );
}
#[test]
fn mixed_key_encodings_cannot_hide_duplicate_javascript_properties() {
    let value: Value = serde_json::from_value(json!({"kind":"object", "value":[
        ["x", {"kind":"null"}], [[120], {"kind":"null"}],
    ]}))
    .unwrap();
    assert!(crate::js_json::stringify(&value, false).is_err());
}
#[test]
fn compact_wire_rejects_invalid_code_units_and_non_string_keys() {
    for value in [json!([-1]), json!([65536]), json!([1.5]), json!(["a"]), json!(true), json!(null)]
    {
        assert!(serde_json::from_value::<Value>(json!({"kind":"string","value":value})).is_err());
        assert!(
            serde_json::from_value::<Value>(
                json!({"kind":"object","value":[[value,{"kind":"null"}]]})
            )
            .is_err(),
        );
    }
}
