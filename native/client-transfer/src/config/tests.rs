use super::{GlobalConfig, layers};
use serde_json::json;

#[test]
fn transport_overrides_preserve_layer_precedence_and_empty_environment_fallback() {
    let global: GlobalConfig =
        serde_json::from_value(json!({"user.token":"global","network.cert":"global cert"}))
            .unwrap();
    let config =
        layers(global, &json!({"user.token":"scope"}), &json!({"user.token":"workspace"}), |key| {
            match key {
                "BIT_CONFIG_USER_TOKEN" => Some("environment".into()),
                "BIT_CONFIG_NETWORK_CERT" => Some(String::new()),
                "BIT_CONFIG_SYMPHONY_URL" => Some("http://127.0.0.1".into()),
                _ => None,
            }
        });
    assert_eq!(config["user.token"], "environment");
    assert_eq!(config["network.cert"], "global cert");
    assert_eq!(config["symphony_url"], "http://127.0.0.1");
}

#[test]
fn bare_scope_transport_uses_scope_and_global_without_workspace_policy() {
    let global: GlobalConfig = serde_json::from_value(json!({
        "user.token":"global-token", "proxy":"global-proxy",
        "network.fetch_timeout":"120000",
    }))
    .unwrap();
    let bare = layers(
        global,
        &json!({
            "user.token":"scope-token", "proxy":"scope-proxy",
        }),
        &json!({}),
        |_| None,
    );
    assert_eq!(bare["user.token"], "scope-token");
    assert_eq!(bare["proxy"], "scope-proxy");
    assert_eq!(bare["network.fetch_timeout"], "120000");
}
