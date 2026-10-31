use super::{environment_key, merge_layers, parse_jsonc};
use serde_json::{Value, json};

#[test]
fn later_origins_replace_values_without_reordering_keys_or_discarding_empty_values() {
    let global = json!({"first":"global","empty":"old","null":true});
    let scope = json!({"first":"scope","second":false});
    let workspace = json!({"empty":"","null":null,"third":0});
    let result = Value::Object(merge_layers(&global, &scope, &workspace));
    assert_eq!(
        serde_json::to_string(&result).unwrap(),
        r#"{"first":"scope","empty":"","null":null,"second":false,"third":0}"#,
    );
}

#[test]
fn environment_names_preserve_hyphens_and_jsonc_preserves_url_strings() {
    assert_eq!(environment_key("network.strict-ssl"), "BIT_CONFIG_NETWORK_STRICT-SSL");
    assert_eq!(
        parse_jsonc(b"{ // configuration\n\"url\": \"https://host/path/*literal*/\", }").unwrap(),
        json!({"url":"https://host/path/*literal*/"}),
    );
}

#[test]
fn scope_json_rendering_has_four_space_indentation_without_a_final_newline() {
    let scope = json!({"name":"local.scope","lanes":{"current":"main"}});
    assert_eq!(
        super::render_scope_json(&scope).unwrap(),
        b"{\n    \"name\": \"local.scope\",\n    \"lanes\": {\n        \"current\": \"main\"\n    }\n}",
    );
}
