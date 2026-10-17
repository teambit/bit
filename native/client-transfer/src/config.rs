//! Published config-getter precedence for transport, authentication and remote resolution.
use crate::GlobalConfig;
use serde_json::Value;

const TRANSPORT_KEYS: &[&str] = &[
    "cloud_domain",
    "symphony_url",
    "user.token",
    "concurrency.fetch",
    "proxy",
    "https_proxy",
    "proxy.no_proxy",
    "proxy.ca",
    "proxy.cafile",
    "proxy.strict_ssl",
    "proxy.cert",
    "proxy.key",
    "network.fetch_retries",
    "network.fetch_retry_factor",
    "network.fetch_retry_mintimeout",
    "network.fetch_retry_maxtimeout",
    "network.fetch_timeout",
    "network.local_address",
    "network.max_sockets",
    "network.concurrency",
    "network.ca",
    "network.cafile",
    "network.strict-ssl",
    "network.cert",
    "network.key",
];

/// `BIT_CONFIG_*` overrides workspace settings, then scope settings, then global settings.
#[must_use]
pub fn effective(global: GlobalConfig, scope: &Value, workspace: &Value) -> GlobalConfig {
    layers(global, scope, workspace, |key| std::env::var(key).ok())
}

fn layers(
    mut global: GlobalConfig,
    scope: &Value,
    workspace: &Value,
    environment: impl Fn(&str) -> Option<String>,
) -> GlobalConfig {
    for layer in [scope, workspace] {
        if let Some(settings) = layer.as_object() {
            global.extend(
                settings
                    .iter()
                    .map(|(key, value)| (key.clone(), value.clone())),
            );
        }
    }
    let keys = global
        .keys()
        .cloned()
        .chain(TRANSPORT_KEYS.iter().map(|key| (*key).to_owned()))
        .collect::<std::collections::BTreeSet<_>>();
    for key in keys {
        if let Some(value) =
            environment(&format!("BIT_CONFIG_{}", key.replace('.', "_").to_uppercase()))
                .filter(|value| !value.is_empty())
        {
            global.insert(key, Value::String(value));
        }
    }
    global
}

#[cfg(test)]
mod tests;
