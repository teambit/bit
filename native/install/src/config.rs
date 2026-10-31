//! Global bit config, `workspace.jsonc` aspects, `dependency-resolver` settings and `scope.json`.

pub use global::{EffectiveConfig, keys, load_global_config};
pub(crate) use merge_config::truthy;
pub use merge_config::{MergeConfig, MergeConfigComponent};
pub use scope_json::{ScopeJson, TrackLane, scope_path};
pub use workspace_config::{
    CONFIG_STORE_ASPECT, DEPENDENCY_RESOLVER_ASPECT, ENVS_ASPECT, GENERATOR_ASPECT,
    VARIANTS_ASPECT, WORKSPACE_ASPECT, WORKSPACE_CONFIG_FILES_ASPECT, WorkspaceConfig,
    WorkspaceSettings, aspect_id_without_version,
};

mod global;
mod merge_config;
mod scope_json;
#[cfg(test)]
mod tests;
mod workspace_config;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The `teambit.dependencies/dependency-resolver` entry of `workspace.jsonc`
/// (`dependency-resolver-workspace-config.ts`). Unknown keys are kept in `rest`.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "The fields mirror the dependency-resolver section of workspace.jsonc."
    )
)]
pub struct DependencyResolverConfig {
    /// `{ dependencies, peerDependencies }`; values are a range or `{ version, preserve }`.
    #[serde(default)]
    pub policy: Value,
    pub package_manager: Option<String>,
    pub proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub ca: Option<String>,
    pub cafile: Option<String>,
    /// A boolean or the string `"true"`/`"false"`.
    pub strict_ssl: Option<Value>,
    pub cert: Option<String>,
    pub key: Option<String>,
    pub no_proxy: Option<String>,
    pub local_address: Option<String>,
    pub fetch_retries: Option<u32>,
    pub fetch_retry_factor: Option<u32>,
    pub fetch_retry_mintimeout: Option<u64>,
    pub fetch_retry_maxtimeout: Option<u64>,
    pub fetch_timeout: Option<u64>,
    pub max_sockets: Option<u32>,
    pub network_concurrency: Option<u32>,
    pub save_prefix: Option<String>,
    pub install_from_bit_dev_registry: Option<bool>,
    pub package_manager_args: Option<Vec<String>>,
    pub overrides: Option<IndexMap<String, String>>,
    pub capsules_overrides: Option<IndexMap<String, String>>,
    /// `isolated` or `hoisted`.
    pub node_linker: Option<String>,
    pub package_import_method: Option<String>,
    pub enable_global_virtual_store: Option<bool>,
    pub global_virtual_store_dir: Option<String>,
    pub patched_dependencies: Option<IndexMap<String, String>>,
    pub package_extensions: Option<IndexMap<String, Value>>,
    pub side_effects_cache: Option<bool>,
    pub root_components: Option<bool>,
    pub node_version: Option<String>,
    pub engine_strict: Option<bool>,
    pub peer_dependency_rules: Option<Value>,
    pub link_core_aspects: Option<bool>,
    pub isolated_capsules: Option<bool>,
    pub never_built_dependencies: Option<Vec<String>>,
    /// `{ name: true | false | "warn" }`.
    pub allow_scripts: Option<IndexMap<String, Value>>,
    pub dangerously_allow_all_scripts: Option<bool>,
    pub prefer_offline: Option<bool>,
    pub capsule_self_reference: Option<bool>,
    pub hoist_patterns: Option<Vec<String>>,
    pub hoist_injected_dependencies: Option<bool>,
    pub auto_install_peers: Option<bool>,
    pub dedupe_peers: Option<bool>,
    pub resolve_env_peers_from_root: Option<bool>,
    pub force_env_peers_to_root: Option<bool>,
    /// `~`, `^`, `+` or `-`.
    pub component_range_prefix: Option<String>,
    pub external_package_manager: Option<bool>,
    pub minimum_release_age: Option<u64>,
    pub minimum_release_age_exclude: Option<Vec<String>>,
    pub user_agent: Option<String>,
    #[serde(flatten)]
    pub rest: IndexMap<String, Value>,
}

impl DependencyResolverConfig {
    /// `rootComponents`, default `false`.
    #[must_use]
    pub fn has_root_components(&self) -> bool {
        self.root_components.unwrap_or(false)
    }

    /// `nodeLinker`: `hoisted` for yarn, otherwise `isolated` unless configured.
    #[must_use]
    pub fn node_linker(&self) -> &str {
        match (
            self.node_linker
                .as_deref()
                .map(str::trim)
                .filter(|linker| !linker.is_empty()),
            self.package_manager.as_deref().map(str::trim),
        ) {
            (Some(linker), _) => linker,
            (None, Some("teambit.dependencies/yarn")) => "hoisted",
            _ => "isolated",
        }
    }

    /// `linkCoreAspects`, default `true`.
    #[must_use]
    pub fn link_core_aspects(&self) -> bool {
        self.link_core_aspects.unwrap_or(true)
    }

    /// `resolveEnvPeersFromRoot`, default `true`.
    #[must_use]
    pub fn resolve_env_peers_from_root(&self) -> bool {
        self.resolve_env_peers_from_root.unwrap_or(true)
    }
}
