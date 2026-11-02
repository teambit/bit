//! Published config-getter precedence for transport, authentication and remote resolution.
//!
//! Normalizes `BIT_CONFIG_*` environment variables against persisted [`GlobalConfig`] and [`TRANSPORT_KEYS`].
#[cfg(test)]
mod tests;

use crate::GlobalConfig;
use serde_json::Value;

/// Configuration keys normalized from `BIT_CONFIG_*` environment variables for transport and auth.
const TRANSPORT_KEYS: &[&str] = &[
    "cloud_domain",
    "symphony_url",
    "user.token",
    "concurrency.fetch",
    "concurrency_fetch",
    "proxy",
    "https_proxy",
    "proxy.no_proxy",
    "proxy.ca",
    "proxy.cafile",
    "proxy.strict_ssl",
    "proxy.strict-ssl",
    "proxy.cert",
    "proxy.key",
    "network.fetch_retries",
    "network.fetch_retry_factor",
    "network.fetch_retry_mintimeout",
    "network.fetch_retry_maxtimeout",
    "network.fetch_timeout",
    "network.fetch-timeout",
    "network.local_address",
    "network.local-address",
    "network.max_sockets",
    "network.max-sockets",
    "network.concurrency",
    "network_concurrency",
    "network.ca",
    "network.cafile",
    "network.strict-ssl",
    "network.strict_ssl",
    "network.cert",
    "network.key",
];

/// `BIT_CONFIG_*` overrides workspace settings, then scope settings, then global settings.
#[inline]
#[must_use]
pub fn effective(global: GlobalConfig, scope: &Value, workspace: &Value) -> GlobalConfig {
    layers(global, scope, workspace, |key| {
        std::env::var(key)
            .ok()
            .map(|val| val.trim().to_owned())
            .filter(|val| !val.is_empty())
    })
}

#[inline]
fn layers(
    global: GlobalConfig,
    scope: &Value,
    workspace: &Value,
    environment: impl Fn(&str) -> Option<String>,
) -> GlobalConfig {
    bit_workspace_config::effective_with_environment(
        &Value::Object(
            global
                .into_iter()
                .filter_map(normalize_entry)
                .collect(),
        ),
        scope,
        workspace,
        TRANSPORT_KEYS,
        environment,
    )
    .into_iter()
    .filter_map(normalize_entry)
    .collect()
}

#[inline]
fn normalize_entry((key, value): (String, Value)) -> Option<(String, Value)> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return None;
    }
    let key = if trimmed.len() == key.len() { key } else { trimmed.to_owned() };
    Some((key, value))
}
