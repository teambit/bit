/// `bit config` keys read during install (`@teambit/legacy.constants`).
pub mod keys {
    pub const CLOUD_DOMAIN: &str = "cloud_domain";
    pub const REGISTRY_URL: &str = "registry";
    pub const USER_TOKEN: &str = "user.token";
    pub const USER_NAME: &str = "user.name";
    pub const USER_EMAIL: &str = "user.email";
    pub const ENABLE_GLOBAL_VIRTUAL_STORE: &str = "enable_global_virtual_store";
    pub const PACKAGE_MANAGER_CACHE: &str = "package-manager.cache";
    pub const FORCE_LOCAL_BUILD: &str = "force_local_build";
    pub const PROXY: &str = "proxy";
    pub const HTTPS_PROXY: &str = "https_proxy";
    pub const PROXY_NO_PROXY: &str = "proxy.no_proxy";
    pub const PROXY_CA: &str = "proxy.ca";
    pub const PROXY_CA_FILE: &str = "proxy.cafile";
    pub const PROXY_STRICT_SSL: &str = "proxy.strict_ssl";
    pub const PROXY_CERT: &str = "proxy.cert";
    pub const PROXY_KEY: &str = "proxy.key";
    pub const FETCH_RETRIES: &str = "network.fetch_retries";
    pub const FETCH_RETRY_FACTOR: &str = "network.fetch_retry_factor";
    pub const FETCH_RETRY_MINTIMEOUT: &str = "network.fetch_retry_mintimeout";
    pub const FETCH_RETRY_MAXTIMEOUT: &str = "network.fetch_retry_maxtimeout";
    pub const FETCH_TIMEOUT: &str = "network.fetch_timeout";
    pub const LOCAL_ADDRESS: &str = "network.local_address";
    pub const MAX_SOCKETS: &str = "network.max_sockets";
    pub const NETWORK_CONCURRENCY: &str = "network.concurrency";
    pub const NETWORK_CA: &str = "network.ca";
    pub const NETWORK_CA_FILE: &str = "network.cafile";
    pub const NETWORK_STRICT_SSL: &str = "network.strict-ssl";
    pub const NETWORK_CERT: &str = "network.cert";
    pub const NETWORK_KEY: &str = "network.key";
    /// The cloud domain when `cloud_domain` is unset.
    pub const DEFAULT_CLOUD_DOMAIN: &str = "bit.cloud";

    /// Every key above, for resolving `BIT_CONFIG_*` overrides.
    pub const ALL: [&str; 29] = [
        CLOUD_DOMAIN,
        REGISTRY_URL,
        USER_TOKEN,
        USER_NAME,
        USER_EMAIL,
        ENABLE_GLOBAL_VIRTUAL_STORE,
        PACKAGE_MANAGER_CACHE,
        FORCE_LOCAL_BUILD,
        PROXY,
        HTTPS_PROXY,
        PROXY_NO_PROXY,
        PROXY_CA,
        PROXY_CA_FILE,
        PROXY_STRICT_SSL,
        PROXY_CERT,
        PROXY_KEY,
        FETCH_RETRIES,
        FETCH_RETRY_FACTOR,
        FETCH_RETRY_MINTIMEOUT,
        FETCH_RETRY_MAXTIMEOUT,
        FETCH_TIMEOUT,
        LOCAL_ADDRESS,
        MAX_SOCKETS,
        NETWORK_CONCURRENCY,
        NETWORK_CA,
        NETWORK_CA_FILE,
        NETWORK_STRICT_SSL,
        NETWORK_CERT,
        NETWORK_KEY,
    ];
}

use super::workspace_config::config_string;
use crate::model::GlobalConfig;
use indexmap::IndexMap;
use serde_json::Value;
use std::{env, fs, io, path::Path};

/// `<dir>/config.json`, Bit's global config (`GlobalConfig.load`). A missing
/// file is an empty config; Bit would create it, install does not need to.
pub fn load_global_config(dir: &Path) -> io::Result<GlobalConfig> {
    let path = dir.join("config.json");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(GlobalConfig::new()),
        Err(error) => return Err(error),
    };
    match serde_json::from_str(&text) {
        Ok(Value::Object(map)) => Ok(map.into_iter().collect()),
        Ok(_) => Ok(GlobalConfig::new()),
        Err(error) => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("failed parsing {}: {error}", path.display()),
        )),
    }
}

/// `configGetter`: `BIT_CONFIG_*` environment variables, then the workspace
/// layer (`teambit.harmony/config-store`), the scope layer (`scope.json`
/// `config`) and the global config, in that order of precedence.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct EffectiveConfig {
    store: IndexMap<String, String>,
}

impl EffectiveConfig {
    #[must_use]
    pub fn new(
        global: &GlobalConfig,
        scope: &IndexMap<String, String>,
        workspace: &IndexMap<String, String>,
    ) -> Self {
        let mut store: IndexMap<String, String> = global
            .iter()
            .filter_map(|(key, value)| Some((key.clone(), config_string(value)?)))
            .collect();
        store.extend(
            scope
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
        store.extend(
            workspace
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
        Self { store }
    }

    /// `BIT_CONFIG_<KEY>`: dots become underscores, upper-cased.
    #[must_use]
    pub fn env_variable_name(key: &str) -> String {
        format!("BIT_CONFIG_{}", key.replace('.', "_").to_uppercase())
    }

    /// `getConfig(key)`. An empty environment variable does not count, as in JavaScript.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<String> {
        if key.is_empty() {
            return None;
        }
        if let Ok(value) = env::var(Self::env_variable_name(key))
            && !value.is_empty()
        {
            return Some(value);
        }
        self.store.get(key).cloned()
    }

    /// `getConfigBoolean`: `"true"`/`"false"`; anything else is an error.
    pub fn get_bool(&self, key: &str) -> io::Result<Option<bool>> {
        match self.get(key).as_deref() {
            None => Ok(None),
            Some("true") => Ok(Some(true)),
            Some("false") => Ok(Some(false)),
            Some(value) => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    r#"the configuration "{key}" has an invalid value "{value}". it should be boolean"#,
                ),
            )),
        }
    }

    /// `getConfigNumeric`: JavaScript `Number(value)`, rejecting `NaN`.
    pub fn get_number(&self, key: &str) -> io::Result<Option<f64>> {
        let Some(value) = self.get(key) else { return Ok(None) };
        let trimmed = value.trim();
        let number = if trimmed.is_empty() { Some(0.0) } else { trimmed.parse::<f64>().ok() };
        number
            .map(Some)
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(r#"config of "{key}" is invalid. Expected number, got "{value}""#),
                )
            })
    }

    /// The layered config as one map, as `configGetter` would answer each install key:
    /// what the engine and the import read.
    #[must_use]
    pub fn merged(&self) -> GlobalConfig {
        let mut merged: GlobalConfig = self.store
            .iter()
            .map(|(key, value)| (key.clone(), Value::String(value.clone())))
            .collect();
        for key in keys::ALL {
            if let Some(value) = self.get(key) {
                merged.insert(key.to_owned(), Value::String(value));
            }
        }
        merged
    }

    /// `getCloudDomain()`.
    #[must_use]
    pub fn cloud_domain(&self) -> String {
        self.get(keys::CLOUD_DOMAIN).unwrap_or_else(|| keys::DEFAULT_CLOUD_DOMAIN.to_owned())
    }
}
