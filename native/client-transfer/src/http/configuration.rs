//! Published network, proxy and TLS client configuration.
use crate::{GlobalConfig, invalid};
use reqwest::{Certificate, Identity, NoProxy, Proxy};
use serde_json::Value;
use std::{fs, io, time::Duration};

/// `Http.getNetworkConfig()` socket settings: `network.fetch_timeout` (default
/// 60000 ms, the whole request), `network.local_address` and
/// `network.max_sockets` (default 15, the agent's per-host socket pool).
pub(super) fn sockets(
    builder: reqwest::ClientBuilder,
    global: &GlobalConfig,
) -> io::Result<reqwest::ClientBuilder> {
    let timeout =
        config_u64(global, &["network.fetch_timeout", "network.fetch-timeout"]).unwrap_or(60_000);
    let max_sockets = usize::try_from(
        config_u64(global, &["network.max_sockets", "network.max-sockets"]).unwrap_or(15),
    )
    .unwrap_or(15);
    let mut builder = builder
        .connect_timeout(Duration::from_mins(1))
        .timeout(Duration::from_millis(timeout))
        .pool_max_idle_per_host(max_sockets.max(1));
    if let Some(address) = config_str(global, "network.local_address")
        .or_else(|| config_str(global, "network.local-address"))
    {
        let address: std::net::IpAddr = address
            .parse()
            .map_err(|_| invalid(&format!("invalid network.local_address: {address}")))?;
        builder = builder.local_address(address);
    }
    Ok(builder)
}

/// `Http.getProxyConfig()`: `proxy`, `https_proxy` (falls back to `proxy`), `proxy.no_proxy`.
pub(super) fn proxy(
    builder: reqwest::ClientBuilder,
    global: &GlobalConfig,
) -> io::Result<reqwest::ClientBuilder> {
    let http = config_str(global, "proxy");
    let https = config_str(global, "https_proxy").or(http);
    let no_proxy = config_str(global, "proxy.no_proxy").and_then(NoProxy::from_string);
    let mut builder = builder;
    if let Some(url) = http {
        builder =
            builder.proxy(Proxy::http(url).map_err(io::Error::other)?.no_proxy(no_proxy.clone()));
    }
    if let Some(url) = https {
        builder = builder.proxy(Proxy::https(url).map_err(io::Error::other)?.no_proxy(no_proxy));
    }
    Ok(builder)
}

/// `strictSSL`, `ca` and `cafile` from `network.*` with the legacy `proxy.*` fallbacks.
pub(super) fn tls(
    builder: reqwest::ClientBuilder,
    global: &GlobalConfig,
) -> io::Result<reqwest::ClientBuilder> {
    let strict = ["network.strict-ssl", "network.strict_ssl", "proxy.strict_ssl"]
        .iter()
        .find_map(|key| global.get(*key))
        .map(|value| {
            value
                .as_bool()
                .unwrap_or_else(|| {
                    value
                        .as_str()
                        .is_some_and(|raw| raw.trim().eq_ignore_ascii_case("true"))
                })
        });
    let mut pem = config_str(global, "network.ca")
        .or_else(|| config_str(global, "proxy.ca"))
        .map(|ca| ca.as_bytes().to_vec());
    if pem.is_none()
        && let Some(file) =
            config_str(global, "network.cafile").or_else(|| config_str(global, "proxy.cafile"))
    {
        pem = Some(fs::read(file)?);
    }
    let builder = builder.tls_danger_accept_invalid_certs(strict == Some(false));
    let builder = identity(builder, global)?;
    let Some(pem) = pem else { return Ok(builder) };
    let certificates = Certificate::from_pem_bundle(&pem).map_err(io::Error::other)?;
    Ok(builder.tls_certs_merge(certificates))
}

pub(super) fn config_str<'a>(global: &'a GlobalConfig, key: &str) -> Option<&'a str> {
    global
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn config_u64(global: &GlobalConfig, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .find_map(|key| global.get(*key))
        .and_then(|value| match value {
            Value::Number(number) => number.as_u64(),
            Value::String(text) => text.trim().parse().ok(),
            _ => None,
        })
}

fn identity(
    builder: reqwest::ClientBuilder,
    global: &GlobalConfig,
) -> io::Result<reqwest::ClientBuilder> {
    let certificate =
        config_str(global, "network.cert").or_else(|| config_str(global, "proxy.cert"));
    let key = config_str(global, "network.key").or_else(|| config_str(global, "proxy.key"));
    let (Some(certificate), Some(key)) = (certificate, key) else { return Ok(builder) };
    let pem = format!("{certificate}\n{key}");
    let identity = Identity::from_pem(pem.as_bytes()).map_err(io::Error::other)?;
    Ok(builder.identity(identity))
}
