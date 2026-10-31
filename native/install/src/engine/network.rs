//! Proxy and network settings: `DependencyResolverMain.getProxyConfig` /
//! `getNetworkConfig`, which layer the `dependency-resolver` config, the pnpm
//! config cascade and Bit's global config (`Http.getProxyConfig` /
//! `Http.getNetworkConfig`).

#[cfg(test)]
mod tests;

use super::registries::global_string;
use crate::{config::DependencyResolverConfig, model::GlobalConfig};
use pnpm_network::NoProxySetting;
use serde_json::Value;
use std::{fs, io, path::Path};

/// `{ httpProxy, httpsProxy, noProxy }`. `no_proxy` is `true` or a
/// comma-separated host list.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ProxySettings {
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<Value>,
}

impl ProxySettings {
    fn is_set(&self) -> bool {
        self.http_proxy.is_some() || self.https_proxy.is_some()
    }

    /// The engine's proxy config. The engine replaces its own wholesale.
    pub(super) fn to_engine(&self) -> pnpm_network::ProxyConfig {
        pnpm_network::ProxyConfig {
            https_proxy: self.https_proxy.clone(),
            http_proxy: self.http_proxy.clone(),
            no_proxy: self.no_proxy.as_ref().and_then(parse_no_proxy),
        }
    }
}

/// The merged `PackageManagerNetworkConfig`; later sources win field by field.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct NetworkSettings {
    pub retry: RetrySettings,
    pub tls: TlsSettings,
    pub max_sockets: Option<u32>,
    pub network_concurrency: Option<u32>,
    pub user_agent: Option<String>,
}

/// How long to wait for a request and how to retry it.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct RetrySettings {
    pub fetch_retries: Option<u32>,
    pub fetch_retry_factor: Option<u32>,
    pub fetch_retry_mintimeout: Option<u64>,
    pub fetch_retry_maxtimeout: Option<u64>,
    pub fetch_timeout: Option<u64>,
}

/// TLS and the local address of outgoing connections.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct TlsSettings {
    pub strict_ssl: Option<bool>,
    pub ca: Option<Vec<String>>,
    pub cert: Option<String>,
    pub key: Option<String>,
    pub local_address: Option<String>,
}

/// Overwrite each field of `target` that `source` sets.
macro_rules! take_set {
    ($target:expr, $source:expr, $($field:ident),*) => {
        $(if $source.$field.is_some() { $target.$field = $source.$field; })*
    };
}

impl NetworkSettings {
    /// `{ ...self, ...other }` for the fields `other` sets.
    fn merge(mut self, other: Self) -> Self {
        take_set!(self, other, max_sockets, network_concurrency, user_agent);
        take_set!(
            self.retry,
            other.retry,
            fetch_retries,
            fetch_retry_factor,
            fetch_retry_mintimeout,
            fetch_retry_maxtimeout,
            fetch_timeout
        );
        take_set!(self.tls, other.tls, strict_ssl, ca, cert, key, local_address);
        self
    }

    /// The engine's TLS config. The engine replaces its own wholesale.
    pub(super) fn to_tls(&self) -> pnpm_network::TlsConfig {
        let tls = &self.tls;
        pnpm_network::TlsConfig {
            ca: tls.ca.clone().unwrap_or_default(),
            cert: tls.cert.clone(),
            key: tls.key.clone(),
            strict_ssl: tls.strict_ssl,
            local_address: tls.local_address
                .as_deref()
                .and_then(|value| value.parse().ok()),
        }
    }
}

/// The first configured of: the `dependency-resolver` config, the pnpm config
/// cascade, Bit's global config.
pub(super) fn proxy(
    config: &pnpm_config::Config,
    dependency_resolver: &DependencyResolverConfig,
    global: &GlobalConfig,
) -> ProxySettings {
    let from_config = ProxySettings {
        http_proxy: dependency_resolver.proxy.clone(),
        https_proxy: dependency_resolver.https_proxy
            .clone()
            .or_else(|| dependency_resolver.proxy.clone()),
        no_proxy: dependency_resolver.no_proxy.clone().map(Value::String),
    };
    let from_pnpm = ProxySettings {
        http_proxy: config.proxy.http_proxy.clone(),
        https_proxy: config.proxy.https_proxy
            .clone()
            .or_else(|| config.proxy.http_proxy.clone()),
        no_proxy: config.proxy.no_proxy.as_ref().map(no_proxy_value),
    };
    let from_global = ProxySettings {
        http_proxy: global_string(global, "proxy").map(str::to_string),
        https_proxy: global_string(global, "https_proxy")
            .or_else(|| global_string(global, "proxy"))
            .map(str::to_string),
        no_proxy: global.get("proxy.no_proxy").cloned(),
    };
    [from_config, from_pnpm, from_global]
        .into_iter()
        .find(ProxySettings::is_set)
        .unwrap_or_default()
}

/// `{ ...global, ...pnpm config, ...dependency-resolver config }`.
pub(super) fn network(
    config: &pnpm_config::Config,
    dependency_resolver: &DependencyResolverConfig,
    global: &GlobalConfig,
) -> io::Result<NetworkSettings> {
    Ok(from_global(global)?
        .merge(from_pnpm(config, global))
        .merge(from_dependency_resolver(dependency_resolver)))
}

/// The first set global config value of `keys`.
fn first<'a>(global: &'a GlobalConfig, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .find_map(|key| {
            global
                .get(*key)
                .filter(|value| !value.is_null())
        })
}

/// `Http.getNetworkConfig`.
fn from_global(global: &GlobalConfig) -> io::Result<NetworkSettings> {
    Ok(NetworkSettings {
        retry: RetrySettings {
            fetch_retries: number(global.get("network.fetch_retries")).or(Some(5)),
            fetch_retry_factor: number(global.get("network.fetch_retry_factor")).or(Some(10)),
            fetch_retry_mintimeout: number(global.get("network.fetch_retry_mintimeout"))
                .or(Some(1000)),
            fetch_retry_maxtimeout: number(global.get("network.fetch_retry_maxtimeout"))
                .or(Some(60_000)),
            fetch_timeout: number(global.get("network.fetch_timeout")).or(Some(60_000)),
        },
        tls: global_tls(global)?,
        max_sockets: number(global.get("network.max_sockets")).or(Some(15)),
        network_concurrency: number(global.get("network.concurrency")),
        user_agent: None,
    })
}

/// The global TLS settings, with `cafile` read into `ca` when `ca` is unset.
fn global_tls(global: &GlobalConfig) -> io::Result<TlsSettings> {
    let mut tls = TlsSettings {
        strict_ssl: first(
            global,
            &["network.strict-ssl", "network.strict_ssl", "proxy.strict_ssl"],
        )
        .and_then(boolean),
        ca: first(global, &["network.ca", "proxy.ca"]).and_then(string_list),
        cert: first(global, &["network.cert", "proxy.cert"])
            .and_then(Value::as_str)
            .map(str::to_string),
        key: first(global, &["network.key", "proxy.key"])
            .and_then(Value::as_str)
            .map(str::to_string),
        local_address: global_string(global, "network.local_address").map(str::to_string),
    };
    if tls.ca.is_none()
        && let Some(cafile) =
            first(global, &["network.cafile", "proxy.cafile"]).and_then(Value::as_str)
    {
        tls.ca = read_ca_file(Path::new(cafile))?;
    }
    Ok(tls)
}

/// `PnpmPackageManager.getNetworkConfig`: the user agent, and only the
/// numeric settings the cascade set explicitly (the rest are engine defaults).
fn from_pnpm(config: &pnpm_config::Config, global: &GlobalConfig) -> NetworkSettings {
    let explicit = |name: &str| config.explicit_settings.contains_key(name);
    let user_agent = if explicit("userAgent") {
        config.user_agent.clone()
    } else {
        format!("bit user/{}", global_string(global, "user.name").unwrap_or("anonymous"))
    };
    NetworkSettings {
        retry: RetrySettings {
            // `readConfig` raises a configured value below 5 to 5.
            fetch_retries: explicit("fetchRetries").then_some(config.fetch_retries.max(5)),
            fetch_timeout: explicit("fetchTimeout").then_some(config.fetch_timeout),
            fetch_retry_maxtimeout: explicit("fetchRetryMaxtimeout")
                .then_some(config.fetch_retry_maxtimeout),
            fetch_retry_mintimeout: explicit("fetchRetryMintimeout")
                .then_some(config.fetch_retry_mintimeout),
            fetch_retry_factor: None,
        },
        tls: TlsSettings {
            strict_ssl: config.tls.strict_ssl,
            ca: (!config.tls.ca.is_empty()).then(|| config.tls.ca.clone()),
            cert: config.tls.cert.clone(),
            key: config.tls.key.clone(),
            local_address: None,
        },
        max_sockets: explicit("maxSockets")
            .then_some(config.max_sockets)
            .flatten()
            .map(|value| u32::try_from(value).unwrap_or(u32::MAX)),
        network_concurrency: explicit("networkConcurrency")
            .then(|| u32::try_from(config.network_concurrency).unwrap_or(u32::MAX)),
        user_agent: Some(user_agent),
    }
}

/// `getNetworkConfigFromDepResolverConfig`.
fn from_dependency_resolver(config: &DependencyResolverConfig) -> NetworkSettings {
    NetworkSettings {
        retry: RetrySettings {
            fetch_retries: config.fetch_retries,
            fetch_retry_factor: config.fetch_retry_factor,
            fetch_retry_mintimeout: config.fetch_retry_mintimeout,
            fetch_retry_maxtimeout: config.fetch_retry_maxtimeout,
            fetch_timeout: config.fetch_timeout,
        },
        tls: TlsSettings {
            strict_ssl: config.strict_ssl.as_ref().and_then(boolean),
            ca: config.ca.clone().map(|ca| vec![ca]),
            cert: config.cert.clone(),
            key: config.key.clone(),
            local_address: None,
        },
        max_sockets: config.max_sockets,
        network_concurrency: config.network_concurrency,
        user_agent: None,
    }
}

/// `readCAFileSync`: the PEM certificates of a CA file; `None` when the file
/// does not exist.
pub(super) fn read_ca_file(path: &Path) -> io::Result<Option<Vec<String>>> {
    const DELIMITER: &str = "-----END CERTIFICATE-----";
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents.replace("\r\n", "\n"),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    Ok(Some(
        contents
            .split(DELIMITER)
            .filter(|ca| !ca.trim().is_empty())
            .map(|ca| format!("{}{DELIMITER}", ca.trim_start()))
            .collect(),
    ))
}

/// `Number(value)` of a global config value (a number or a numeric string).
fn number<Number: TryFrom<u64>>(value: Option<&Value>) -> Option<Number> {
    let value = match value? {
        Value::Number(number) => number.as_u64()?,
        Value::String(text) => text.trim().parse().ok()?,
        _ => return None,
    };
    Number::try_from(value).ok()
}

/// A boolean, or the strings `"true"`/`"false"`.
fn boolean(value: &Value) -> Option<bool> {
    match value {
        Value::Bool(value) => Some(*value),
        Value::String(text) => Some(text.trim().eq_ignore_ascii_case("true")),
        _ => None,
    }
}

fn string_list(value: &Value) -> Option<Vec<String>> {
    match value {
        Value::String(text) => Some(vec![text.clone()]),
        Value::Array(items) => Some(
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect(),
        ),
        _ => None,
    }
}

fn no_proxy_value(setting: &NoProxySetting) -> Value {
    match setting {
        NoProxySetting::Bypass => Value::Bool(true),
        NoProxySetting::List(hosts) => Value::String(hosts.join(",")),
    }
}

/// `true`, or a comma-separated host list (as `@pnpm/napi` parses it).
fn parse_no_proxy(value: &Value) -> Option<NoProxySetting> {
    match value {
        Value::Bool(true) => Some(NoProxySetting::Bypass),
        Value::String(items) => Some(NoProxySetting::List(
            items
                .split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect(),
        )),
        _ => None,
    }
}
