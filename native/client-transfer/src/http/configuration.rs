//! Published network, proxy and TLS client configuration.
//!
//! [`sockets`] configures `reqwest::ClientBuilder` from [`GlobalConfig`] with [`Proxy`], [`NoProxy`], [`Certificate`], and [`Identity`] ([`invalid`]).
use crate::{GlobalConfig, invalid};
use reqwest::{Certificate, Identity, NoProxy, Proxy};
use serde_json::Value;
use std::{fs, io, time::Duration};

/// `Http.getNetworkConfig()` socket settings: `network.fetch_timeout` (default
/// 60000 ms, the whole request), `network.local_address` and
/// `network.max_sockets` (default 15, the agent's per-host socket pool).
#[inline]
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

/// Applies `Http.getProxyConfig()` (`proxy`, `https_proxy`, `proxy.no_proxy`) to `builder`.
#[inline]
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
#[inline]
pub(super) fn tls(
    builder: reqwest::ClientBuilder,
    global: &GlobalConfig,
) -> io::Result<reqwest::ClientBuilder> {
    let strict =
        ["network.strict-ssl", "network.strict_ssl", "proxy.strict_ssl", "proxy.strict-ssl"]
            .iter()
            .find_map(|key| global.get(*key).and_then(strict_bool));
    let mut pem = config_str(global, "network.ca")
        .or_else(|| config_str(global, "proxy.ca"))
        .map(|ca| ca.as_bytes().to_vec());
    if pem.is_none()
        && let Some(file) =
            config_str(global, "network.cafile").or_else(|| config_str(global, "proxy.cafile"))
    {
        if fs::metadata(file)?.len() > 16 * 1024 * 1024 {
            return Err(invalid("network.cafile exceeds size limit"));
        }
        pem = Some(fs::read(file)?);
    }
    let builder = builder.tls_danger_accept_invalid_certs(strict == Some(false));
    let builder = identity(builder, global)?;
    let Some(pem) = pem else { return Ok(builder) };
    let certificates = Certificate::from_pem_bundle(&pem).map_err(io::Error::other)?;
    Ok(builder.tls_certs_merge(certificates))
}

/// Parses a boolean or `"1"`/`"true"`/`"0"`/`"false"` string from `value`.
#[inline]
fn strict_bool(value: &Value) -> Option<bool> {
    if let Some(flag) = value.as_bool() {
        return Some(flag);
    }
    let text = value.as_str()?.trim();
    if text == "1" || text.eq_ignore_ascii_case("true") {
        Some(true)
    } else if text == "0" || text.eq_ignore_ascii_case("false") {
        Some(false)
    } else {
        None
    }
}

#[inline]
pub(super) fn config_str<'a>(global: &'a GlobalConfig, key: &str) -> Option<&'a str> {
    global
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[inline]
fn config_u64(global: &GlobalConfig, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .find_map(|key| {
            let value = global.get(*key)?;
            match value {
                Value::Number(number) => number.as_u64(),
                Value::String(text) => text.trim().parse().ok(),
                _ => None,
            }
            .filter(|parsed| *parsed > 0)
        })
}

#[inline]
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
