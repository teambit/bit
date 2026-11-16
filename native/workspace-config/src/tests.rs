//! Unit tests for layered workspace configuration [`merge_layers`], [`environment_key`], and [`parse_jsonc`] in `bit-workspace-config`.
//!
//! Checks global/scope/workspace config precedence ([`later_origins_replace_values_without_reordering_keys_or_discarding_empty_values`], [`merge_layers_returns_empty_map_when_all_layers_are_empty_objects`]), env var key mapping ([`environment_names_preserve_hyphens_and_jsonc_preserves_url_strings`]), and `ScopeJson` formatting ([`scope_json_rendering_has_four_space_indentation_without_a_final_newline`]).

use super::{environment_key, merge_layers, parse_jsonc};
use serde_json::{Value, json};

/// Verifies that [`merge_layers`] replaces values from later origins while preserving key order and empty/null values.
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

/// Verifies that [`environment_key`] preserves hyphens in config keys and [`parse_jsonc`] preserves `/*...*/` inside URL strings.
#[test]
fn environment_names_preserve_hyphens_and_jsonc_preserves_url_strings() {
    assert_eq!(environment_key("network.strict-ssl"), "BIT_CONFIG_NETWORK_STRICT-SSL");
    assert_eq!(
        parse_jsonc(b"{ // configuration\n\"url\": \"https://host/path/*literal*/\", }").unwrap(),
        json!({"url":"https://host/path/*literal*/"}),
    );
}

/// Verifies that [`super::render_scope_json`] formats `ScopeJson` objects with 4-space indentation and no trailing newline.
#[test]
fn scope_json_rendering_has_four_space_indentation_without_a_final_newline() {
    let scope = json!({"name":"local.scope","lanes":{"current":"main"}});
    assert_eq!(
        super::render_scope_json(&scope).unwrap(),
        b"{\n    \"name\": \"local.scope\",\n    \"lanes\": {\n        \"current\": \"main\"\n    }\n}",
    );
}

/// Verifies that [`merge_layers`] returns an empty map when all three configuration layers are empty [`json`] objects.
#[test]
fn merge_layers_returns_empty_map_when_all_layers_are_empty_objects() {
    let empty = json!({});
    assert!(merge_layers(&empty, &empty, &empty).is_empty());
}
