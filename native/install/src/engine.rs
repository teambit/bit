//! pnpm engine (pacquet) driver.
//!
//! Ports `lynx.ts`, `pnpm.package-manager.ts`, `pnpm-prune-modules.ts` and
//! the registry, proxy and network resolution of the `dependency-resolver`
//! aspect. The install itself mirrors how `@pnpm/napi` drives
//! `pnpm_package_manager::Install` (`napi/src/install.rs`), with Bit's
//! `readPackage` hooks implemented natively instead of through a JavaScript
//! callback.

pub use cloud_user::{
    LOOKUP_TIMEOUT as CLOUD_LOOKUP_TIMEOUT, apply_cloud_username, cloud_username,
};
pub use error::EngineError;
pub use network::{NetworkSettings, ProxySettings, RetrySettings, TlsSettings};
pub use peers::missing_peers;
pub use prune::prune_modules;
pub use registries::{Registries, Registry};
pub use reporter::{OutputSink, ReporterSettings};
pub use resolve::{ResolvedVersion, resolve_remote_version};
pub use restore::RestoreInput;
pub use run::install;
pub use scripts::ScriptPolicy;
pub use settings::{EnvVars, settings};

mod cloud_user;
mod config_overlay;
mod error;
mod hooks;
mod lockfile_attrs;
mod network;
mod peers;
mod prune;
mod registries;
mod reporter;
mod resolve;
mod restore;
mod run;
mod scripts;
mod session;
mod settings;
mod virtual_store_guard;

use crate::model::DependencyMap;
use indexmap::IndexMap;
use serde_json::Value;
use std::path::PathBuf;

/// The virtual store dir name limit of `@teambit/dependencies.pnpm.dep-path`.
pub const VIRTUAL_STORE_DIR_MAX_LENGTH: usize = if cfg!(windows) { 60 } else { 120 };

/// Recorded as the lockfile's `pnpmfileChecksum`, the same constant `lynx.ts`
/// records. Bump it when the hooks change what they do to dependency
/// manifests, so existing lockfiles are resolved again.
pub const READ_PACKAGE_HOOKS_CHECKSUM: &str = "bit-1";

/// Everything the engine needs besides the projects, resolved once per command
/// from the `dependency-resolver` config, Bit's global config, the pnpm config
/// cascade (`.npmrc`, `pnpm-workspace.yaml`) and the environment.
#[derive(Debug, Clone)]
pub struct EngineSettings {
    pub root: PathBuf,
    /// The pnpm config cascade resolved at `root`, before Bit's overlay.
    base: pnpm_config::Config,
    pub registry: RegistrySettings,
    pub store: StoreSettings,
    pub layout: LayoutSettings,
    pub resolution: ResolutionSettings,
    pub policy: PolicySettings,
    /// pnpm's rendered output; `None` hides it.
    pub reporter: Option<ReporterSettings>,
}

impl EngineSettings {
    /// Supply the published build-script PATH to child processes without changing
    /// the environment of already-running native workers.
    pub(crate) fn set_build_scripts_path(&mut self, path: String) {
        if !self.base.extra_env
            .keys()
            .any(|key| key.eq_ignore_ascii_case("PATH"))
        {
            self.base.extra_env.insert("PATH".to_string(), path);
        }
    }
}

/// Where packages come from and how to reach them.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct RegistrySettings {
    pub registries: Registries,
    /// `Authorization` header values keyed by nerf-darted registry URI, plus
    /// `""` for the default registry (`buildAuthHeaderByUri`).
    pub auth_header_by_uri: IndexMap<String, String>,
    /// The user agent is Bit's `bit user/<username>` (no `userAgent` in the
    /// pnpm config cascade); the cloud username replaces the global
    /// `user.name` once it is known (`apply_cloud_username`).
    pub cloud_user_agent: bool,
    pub proxy: ProxySettings,
    pub network: NetworkSettings,
}

/// The content-addressable store and how packages are imported from it.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct StoreSettings {
    pub store_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub pnpm_home_dir: Option<PathBuf>,
    pub package_import_method: Option<String>,
}

/// How `node_modules` and the virtual store are laid out.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct LayoutSettings {
    /// `isolated` or `hoisted`.
    pub node_linker: String,
    pub root_components: bool,
    pub hoist_pattern: Vec<String>,
    pub public_hoist_pattern: Vec<String>,
    pub hoist_injected_dependencies: bool,
    pub enable_global_virtual_store: bool,
    pub global_virtual_store_dir: Option<PathBuf>,
    /// The running bit's `@teambit/bit` dir, which a layout switch must not delete.
    pub bit_dir: PathBuf,
}

/// What the resolution takes into account.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct ResolutionSettings {
    pub auto_install_peers: bool,
    pub dedupe_peers: bool,
    pub dedupe_injected_deps: bool,
    pub engine_strict: bool,
    pub node_version: Option<String>,
    pub patched_dependencies: Option<IndexMap<String, String>>,
    pub package_extensions: Option<IndexMap<String, Value>>,
    pub prefer_offline: Option<bool>,
}

/// Which packages may build and be installed.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct PolicySettings {
    pub scripts: ScriptPolicy,
    pub minimum_release_age: u64,
    pub minimum_release_age_exclude: Option<Vec<String>>,
    /// `{ allowAny: ['*'], ignoreMissing: ['*'], ...workspace rules }`.
    pub peer_dependency_rules: Value,
}

/// Per-call install options (`bit install` flags).
#[derive(Default, Clone)]
pub struct EngineInstallOptions {
    /// `--update`: re-resolve everything (`updateAll`).
    pub update_all: bool,
    /// `--lockfile-only`.
    pub lockfile_only: bool,
    /// `--no-optional` turns it off.
    pub include_optional_deps: bool,
    /// `--restore`: write a lockfile from the components' dependency graphs first.
    pub restore: Option<RestoreInput>,
    /// Where pnpm's rendered output goes; stdout when `None`.
    pub output: Option<OutputSink>,
}

/// The outcome of one engine install.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct EngineResult {
    /// `added + removed > 0`.
    pub dependencies_changed: bool,
    /// Sorted; `None` when the install did not compute the list (frozen or
    /// lockfile-only path), so the recorded one stands.
    pub deps_requiring_build: Option<Vec<String>>,
    pub store_dir: PathBuf,
}

/// The `{ name: range }` map of the missing peer dependencies of the root
/// importer (`getMissingPeerDependencies`).
pub type MissingPeers = DependencyMap;

#[cfg(test)]
mod tests;
