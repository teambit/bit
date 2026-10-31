//! Registries: the pnpm config cascade's registries (`get-registries.ts`,
//! `PnpmPackageManager.getRegistries`) with Bit's cloud registry layered on
//! top (`DependencyResolverMain.getRegistries`).

#[cfg(test)]
mod tests;

use crate::{config::DependencyResolverConfig, model::GlobalConfig};
use indexmap::IndexMap;
use pnpm_network::{AuthHeadersByScope, DEFAULT_REGISTRY_SCOPE, nerf_dart};

/// The npmjs registry.
pub const NPM_REGISTRY: &str = "https://registry.npmjs.org/";
/// The cloud domain when `cloud_domain` is not configured.
const DEFAULT_CLOUD_DOMAIN: &str = "bit.cloud";

/// One registry and the `Authorization` header sent to it.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Registry {
    pub uri: String,
    pub always_auth: bool,
    /// Empty when there is no credential.
    pub auth_header_value: String,
}

/// The default registry plus one registry per scope (scope names without `@`).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Registries {
    pub default: Registry,
    pub scopes: IndexMap<String, Registry>,
}

impl Registries {
    /// `{ default: uri, '@scope': uri }` (`Registries.toMap`).
    #[must_use]
    pub fn to_map(&self) -> IndexMap<String, String> {
        let default_uri = self.default.uri.trim();
        let default = if default_uri.is_empty() { NPM_REGISTRY } else { default_uri };
        let mut map = IndexMap::from([("default".to_string(), default.to_string())]);
        for (name, registry) in &self.scopes {
            map.insert(format!("@{}", name.trim()), registry.uri.trim().to_string());
        }
        map
    }

    /// `buildAuthHeaderByUri`: headers keyed by nerf-darted URI, plus `""` for
    /// the default registry.
    #[must_use]
    pub fn auth_header_by_uri(&self) -> IndexMap<String, String> {
        let mut result = IndexMap::new();
        for registry in self.scopes.values() {
            let uri = registry.uri.trim();
            let auth = registry.auth_header_value.trim();
            if !uri.is_empty() && !auth.is_empty() {
                result.insert(nerf_dart(uri), auth.to_string());
            }
        }
        let default_uri = self.default.uri.trim();
        let default_auth = self.default.auth_header_value.trim();
        if !default_auth.is_empty() {
            if !default_uri.is_empty() {
                result.insert(nerf_dart(default_uri), default_auth.to_string());
            }
            result.insert(String::new(), default_auth.to_string());
        }
        result
    }
}

/// `BIT_CLOUD_REGISTRY`: `https://node-registry.<cloud domain>/`.
#[must_use]
pub fn bit_cloud_registry(global: &GlobalConfig) -> String {
    let domain = global_string(global, "cloud_domain").unwrap_or(DEFAULT_CLOUD_DOMAIN);
    format!("https://node-registry.{domain}/")
}

/// The registries an install uses.
pub(super) fn resolve(
    config: &pnpm_config::Config,
    dependency_resolver: &DependencyResolverConfig,
    global: &GlobalConfig,
) -> Registries {
    let cloud_registry = bit_cloud_registry(global);
    let mut registries = from_pnpm_config(config, &cloud_registry);
    let bit_auth = bit_auth_header(global);
    if dependency_resolver.install_from_bit_dev_registry.unwrap_or(true)
        && is_npmjs(&registries.default.uri)
    {
        let uri = global_string(global, "registry")
            .map_or_else(|| cloud_registry.clone(), str::to_string);
        registries.default = Registry {
            uri,
            always_auth: !bit_auth.is_empty(),
            auth_header_value: bit_auth.clone(),
        };
    }
    add_auth_to_scoped_bit_registries(&mut registries, &cloud_registry, &bit_auth);
    registries
}

/// The default registry is npmjs or unset, so Bit's registry proxies it.
fn is_npmjs(uri: &str) -> bool {
    let trimmed = uri.trim();
    trimmed.is_empty() || trimmed == NPM_REGISTRY || NPM_REGISTRY.starts_with(trimmed)
}

/// `getRegistries(config)` plus the `bit` scope registry when it is missing.
fn from_pnpm_config(config: &pnpm_config::Config, cloud_registry: &str) -> Registries {
    let by_scope = config.auth_headers.to_by_scope();
    let mut registries = Registries::default();
    for (name, url) in configured_registries(config) {
        let header = registry_auth_header(&by_scope, &name, &url).unwrap_or_default();
        let registry =
            Registry { uri: url, always_auth: !header.is_empty(), auth_header_value: header };
        if name == "default" {
            registries.default = registry;
        } else {
            registries.scopes.insert(name.replacen('@', "", 1), registry);
        }
    }
    registries.scopes
        .entry("bit".to_string())
        .or_insert_with(|| Registry {
            uri: cloud_registry.to_string(),
            always_auth: true,
            auth_header_value: String::new(),
        });
    registries
}

/// `readConfig`'s registry list: `default` from `config.registry` unless the
/// scope map sets it, then every scope (`resolved_registries` in napi).
fn configured_registries(config: &pnpm_config::Config) -> Vec<(String, String)> {
    let mut list = Vec::new();
    if !config.registries_by_scope.contains_key("default") {
        list.push(("default".to_string(), config.registry.trim().to_string()));
    }
    list.extend(
        config.registries_by_scope
            .iter()
            .map(|(name, url)| (name.trim().to_string(), url.trim().to_string())),
    );
    list
}

/// A scope registry prefers its scope-keyed credential; both fall back to the
/// registry-wide (`@`) one.
fn registry_auth_header(by_scope: &AuthHeadersByScope, name: &str, url: &str) -> Option<String> {
    let scoped = by_scope.get(&nerf_dart(url))?;
    let own = if name == "default" { None } else { scoped.get(name) };
    own.or_else(|| scoped.get(DEFAULT_REGISTRY_SCOPE))
        .cloned()
}

/// `Bearer <user.token>`, or empty without a token (`getBitAuthConfig`).
fn bit_auth_header(global: &GlobalConfig) -> String {
    global_string(global, "user.token").map_or_else(String::new, |token| format!("Bearer {token}"))
}

/// Registries pointing at Bit's cloud registry without a credential get Bit's
/// token (`addAuthToScopedBitRegistries`).
fn add_auth_to_scoped_bit_registries(
    registries: &mut Registries,
    cloud_registry: &str,
    bit_auth: &str,
) {
    for registry in registries.scopes.values_mut() {
        let uri = registry.uri.trim();
        if registry.auth_header_value.trim().is_empty()
            && !uri.is_empty()
            && cloud_registry.contains(uri)
        {
            registry.always_auth = true;
            registry.auth_header_value = bit_auth.to_string();
        }
    }
}

/// A global config value as a non-empty string.
pub(super) fn global_string<'a>(global: &'a GlobalConfig, key: &str) -> Option<&'a str> {
    global
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}
