//! The engine config of one call: the pnpm config cascade with Bit's settings
//! applied over it, exactly as `@pnpm/napi` applies the options `lynx.ts`
//! passes (`build_overlay` / `build_config` in `napi/src`).
//!
//! The engine holds a `&'static Config`. Configs are interned by content, so a
//! long-lived process that installs repeatedly leaks one config per distinct
//! configuration rather than one per call.

use super::{EngineSettings, VIRTUAL_STORE_DIR_MAX_LENGTH, error::diagnostic};
use crate::model::DependencyMap;
use pnpm_config::{Config, LinkWorkspacePackages, NodeLinker, PackageImportMethod};
use pnpm_network::{AuthHeaders, ThrottledClient, nerf_dart, normalize_auth_key};
use std::{
    collections::{HashMap, hash_map::DefaultHasher},
    hash::{Hash, Hasher},
    io,
    sync::{Arc, Mutex, OnceLock},
};

/// What one install call adds to the settings.
pub(super) struct CallOverlay<'a> {
    pub overrides: &'a DependencyMap,
    pub forced_harmony_version: Option<&'a str>,
    pub external_dependencies: &'a [String],
    pub update_all: bool,
}

/// The interned engine config of an install.
pub(super) fn install_config(
    settings: &EngineSettings,
    call: &CallOverlay<'_>,
) -> io::Result<&'static Config> {
    let mut config = settings.base.clone();
    apply_store_and_registries(&mut config, settings);
    apply_layout(&mut config, settings);
    apply_manifest_rewrites(&mut config, settings, call)?;
    apply_install_flags(&mut config, settings, call.update_all);
    apply_network(&mut config, settings);
    apply_policy(&mut config, settings)?;
    finish(&mut config, settings);
    Ok(intern(config))
}

/// A query that resolves without installing.
pub(super) enum Query<'a> {
    /// `resolveDependency`: the cascade's own credentials stay, Bit's
    /// registries' credentials win.
    Resolve,
    /// `getPeerDependencyIssues`: missing peers must surface, so peers are
    /// not auto-installed.
    PeerIssues { overrides: &'a DependencyMap },
}

/// The engine config of a query: registries, credentials, proxy and network
/// only, like the options `lynx.ts` passes for it.
pub(super) fn query_config(settings: &EngineSettings, query: &Query<'_>) -> &'static Config {
    let mut config = settings.base.clone();
    let cascade_auth = matches!(query, Query::Resolve).then(|| cascade_auth_headers(&config));
    apply_store_and_registries(&mut config, settings);
    if let Some(cascade_auth) = cascade_auth {
        let mut headers = cascade_auth;
        headers.extend(pin_unkeyed_header(settings));
        config.auth_headers = Arc::new(AuthHeaders::from_map(headers));
    }
    apply_network(&mut config, settings);
    config.virtual_store_dir_max_length = VIRTUAL_STORE_DIR_MAX_LENGTH as u64;
    config.peers_suffix_max_length = 1000;
    if let Query::PeerIssues { overrides } = query {
        config.overrides = Some((*overrides).clone());
        config.auto_install_peers = false;
    }
    finish(&mut config, settings);
    intern(config)
}

/// The cascade's registry-wide (`@`) headers by URI (`readConfig`'s
/// `authHeaderByUri`).
fn cascade_auth_headers(config: &Config) -> HashMap<String, String> {
    config.auth_headers
        .to_by_scope()
        .into_iter()
        .filter_map(|(uri, by_scope)| {
            by_scope
                .get(pnpm_network::DEFAULT_REGISTRY_SCOPE)
                .map(|header| (uri, header.clone()))
        })
        .collect()
}

/// The HTTP client of an engine call.
pub(super) fn http_client(config: &'static Config) -> io::Result<Arc<ThrottledClient>> {
    Ok(Arc::new(
        ThrottledClient::for_installs(
            &config.proxy,
            &config.tls,
            &config.tls_by_uri,
            &config.network_settings(),
        )
        .map_err(|error| diagnostic(&error))?
        .with_max_sockets_per_host(config.max_sockets),
    ))
}

fn apply_store_and_registries(config: &mut Config, settings: &EngineSettings) {
    config.store_dir = pnpm_store_dir::StoreDir::new(settings.store.store_dir.clone());
    config.store_relocation = None;
    config.cache_dir.clone_from(&settings.store.cache_dir);
    for (scope, url) in settings.registry.registries.to_map() {
        if scope == "default" {
            config.registry.clone_from(&url);
        }
        config.registries_by_scope.insert(scope, url);
    }
    config.proxy = settings.registry.proxy.to_engine();
    config.tls = settings.registry.network.to_tls();
    config.auth_headers = Arc::new(AuthHeaders::from_map(pin_unkeyed_header(settings)));
}

fn apply_layout(config: &mut Config, settings: &EngineSettings) {
    config.node_linker = if settings.layout.node_linker == "hoisted" {
        NodeLinker::Hoisted
    } else {
        NodeLinker::Isolated
    };
    config.link_workspace_packages = LinkWorkspacePackages::Deep;
    if let Some(method) = settings.store.package_import_method.as_deref().and_then(import_method) {
        config.package_import_method = method;
    }
    config.virtual_store_dir_max_length = VIRTUAL_STORE_DIR_MAX_LENGTH as u64;
    // The hoisted linker has no virtual store for the global one to replace.
    config.enable_global_virtual_store =
        settings.layout.enable_global_virtual_store && settings.layout.node_linker != "hoisted";
    if let Some(dir) = &settings.layout.global_virtual_store_dir {
        config.global_virtual_store_dir.clone_from(dir);
    }
}

fn apply_manifest_rewrites(
    config: &mut Config,
    settings: &EngineSettings,
    call: &CallOverlay<'_>,
) -> io::Result<()> {
    if let Some(extensions) = &settings.resolution.package_extensions {
        let parsed = extensions
            .iter()
            .map(|(selector, extension)| {
                Ok((selector.clone(), serde_json::from_value(extension.clone())?))
            })
            .collect::<Result<_, serde_json::Error>>()
            .map_err(|error| io::Error::other(format!("invalid packageExtensions: {error}")))?;
        config.package_extensions = Some(parsed);
    }
    if let Some(patched) = &settings.resolution.patched_dependencies {
        let root = &settings.root;
        let joined = patched
            .iter()
            .map(|(key, path)| (key.clone(), root.join(path).display().to_string()));
        config.patched_dependencies = Some(joined.collect());
        config.workspace_dir.get_or_insert_with(|| root.clone());
    }
    config.hoist_pattern = Some(hoist_pattern(settings, call.external_dependencies));
    config.public_hoist_pattern = Some(settings.layout.public_hoist_pattern.clone());
    config.external_dependencies = call.external_dependencies
        .iter()
        .cloned()
        .collect();
    let mut overrides = call.overrides.clone();
    if let Some(version) = call.forced_harmony_version {
        // Harmony is a singleton: a version the workspace forces holds across the graph.
        overrides.insert("@teambit/harmony".to_string(), version.to_string());
    }
    config.overrides = Some(overrides);
    Ok(())
}

/// With root components, the components' own packages are not hoisted unless
/// `hoistInjectedDependencies` is set.
fn hoist_pattern(settings: &EngineSettings, external_dependencies: &[String]) -> Vec<String> {
    let mut pattern = settings.layout.hoist_pattern.clone();
    if !pattern.is_empty() && !settings.layout.hoist_injected_dependencies {
        pattern.extend(
            external_dependencies
                .iter()
                .map(|name| format!("!{name}")),
        );
    }
    pattern
}

fn apply_install_flags(config: &mut Config, settings: &EngineSettings, update_all: bool) {
    config.auto_install_peers = settings.resolution.auto_install_peers;
    config.exclude_links_from_lockfile = true;
    config.hoist_workspace_packages = false;
    config.inject_workspace_packages = true;
    if let Some(prefer_offline) = settings.resolution.prefer_offline {
        config.prefer_offline = prefer_offline;
    }
    config.prefer_frozen_lockfile = !update_all;
    config.dedupe_peer_dependents = true;
    config.dedupe_peers = settings.resolution.dedupe_peers;
    config.dedupe_direct_deps = true;
    config.dedupe_injected_deps = settings.resolution.dedupe_injected_deps;
    config.resolve_peers_from_workspace_root = true;
    config.peers_suffix_max_length = 1000;
}

fn apply_network(config: &mut Config, settings: &EngineSettings) {
    let network = &settings.registry.network;
    if let Some(value) = network.network_concurrency {
        config.network_concurrency = value as usize;
    }
    if let Some(value) = network.max_sockets {
        config.max_sockets = Some(value as usize);
    }
    if let Some(value) = network.retry.fetch_retries {
        config.fetch_retries = value;
    }
    if let Some(value) = network.retry.fetch_retry_factor {
        config.fetch_retry_factor = value;
    }
    if let Some(value) = network.retry.fetch_retry_mintimeout {
        config.fetch_retry_mintimeout = value;
    }
    if let Some(value) = network.retry.fetch_retry_maxtimeout {
        config.fetch_retry_maxtimeout = value;
    }
    if let Some(value) = network.retry.fetch_timeout {
        config.fetch_timeout = value;
    }
    if let Some(user_agent) = &network.user_agent {
        config.user_agent.clone_from(user_agent);
    }
}

fn apply_policy(config: &mut Config, settings: &EngineSettings) -> io::Result<()> {
    // Bit reports the deps requiring a build instead of failing.
    config.strict_dep_builds = false;
    config.allow_builds = settings.policy.scripts.allow_builds
        .iter()
        .map(|(name, allowed)| (name.clone(), *allowed))
        .collect();
    if let Some(value) = settings.policy.scripts.dangerously_allow_all_builds {
        config.dangerously_allow_all_builds = value;
    }
    // Bit lockfiles are trusted workspace input.
    config.trust_lockfile = true;
    config.engine_strict = settings.resolution.engine_strict;
    if let Some(node_version) = &settings.resolution.node_version {
        config.node_version = Some(node_version.clone());
    }
    config.minimum_release_age = Some(settings.policy.minimum_release_age);
    if let Some(exclude) = &settings.policy.minimum_release_age_exclude {
        config.minimum_release_age_exclude = Some(exclude.clone());
    }
    let rules: pnpm_config::PeerDependencyRules =
        serde_json::from_value(settings.policy.peer_dependency_rules.clone())
            .map_err(|error| io::Error::other(format!("invalid peerDependencyRules: {error}")))?;
    let current = &mut config.peer_dependency_rules;
    current.ignore_missing =
        rules.ignore_missing.or_else(|| current.ignore_missing.take());
    current.allow_any = rules.allow_any.or_else(|| current.allow_any.take());
    current.allowed_versions =
        rules.allowed_versions.or_else(|| current.allowed_versions.take());
    Ok(())
}

/// The derivations `build_config` runs after the overlay.
fn finish(config: &mut Config, settings: &EngineSettings) {
    config.apply_virtual_store_only_derivation();
    let virtual_store_dir_explicit = config.explicit_settings.contains_key("virtualStoreDir");
    let global_virtual_store_dir_explicit =
        settings.layout.global_virtual_store_dir.is_some()
            || config.explicit_settings.contains_key("globalVirtualStoreDir");
    config.apply_global_virtual_store_derivation(
        virtual_store_dir_explicit,
        global_virtual_store_dir_explicit,
    );
}

/// Key the unkeyed (`""`) default-registry header at the default registry;
/// a header already keyed at that URI wins (as `@pnpm/napi` pins it).
fn pin_unkeyed_header(settings: &EngineSettings) -> HashMap<String, String> {
    let mut by_uri = HashMap::new();
    let mut unkeyed = None;
    for (uri, header) in &settings.registry.auth_header_by_uri {
        if uri.is_empty() {
            unkeyed = Some(header);
        } else {
            by_uri.insert(normalize_auth_key(uri.clone()), header.clone());
        }
    }
    let default_uri = nerf_dart(&settings.registry.registries.to_map()["default"]);
    if let Some(header) = unkeyed
        && !default_uri.is_empty()
    {
        by_uri.entry(default_uri).or_insert_with(|| header.clone());
    }
    by_uri
}

fn import_method(value: &str) -> Option<PackageImportMethod> {
    match value {
        "auto" => Some(PackageImportMethod::Auto),
        "hardlink" => Some(PackageImportMethod::Hardlink),
        "copy" => Some(PackageImportMethod::Copy),
        "clone" => Some(PackageImportMethod::Clone),
        "clone-or-copy" => Some(PackageImportMethod::CloneOrCopy),
        _ => None,
    }
}

/// Leak `config` once per distinct content.
fn intern(config: Config) -> &'static Config {
    static CACHE: OnceLock<Mutex<HashMap<u64, &'static Config>>> = OnceLock::new();
    let mut hasher = DefaultHasher::new();
    format!("{config:?}").hash(&mut hasher);
    let key = hasher.finish();
    let mut cache = CACHE
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    cache
        .entry(key)
        .or_insert_with(|| &*config.leak())
}

#[cfg(test)]
mod tests;
