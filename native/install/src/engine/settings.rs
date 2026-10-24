//! Resolve [`EngineSettings`] once per command.

use super::{
    EngineSettings, LayoutSettings, PolicySettings, RegistrySettings, ResolutionSettings,
    StoreSettings, error::diagnostic, network, registries, registries::global_string,
    reporter::ReporterSettings, scripts,
};
use crate::{config::DependencyResolverConfig, host::HostInfo, model::GlobalConfig};
use indexmap::IndexMap;
use pnpm_config::{Config, Host};
use serde_json::{Value, json};
use std::{io, path::Path};

/// The environment variables that change how Bit installs.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct EnvVars {
    /// `BIT_ENABLE_GLOBAL_VIRTUAL_STORE`: overrides the configured global virtual store.
    pub enable_global_virtual_store: Option<String>,
    /// `BIT_ALLOW_SCRIPTS`: a JSON object merged over `allowScripts`, not persisted.
    pub allow_scripts: Option<String>,
}

impl EnvVars {
    /// Read them from the process environment.
    #[must_use]
    pub fn from_process() -> Self {
        EnvVars {
            enable_global_virtual_store: std::env::var("BIT_ENABLE_GLOBAL_VIRTUAL_STORE").ok(),
            allow_scripts: std::env::var("BIT_ALLOW_SCRIPTS").ok(),
        }
    }
}

/// Resolve the engine settings of the workspace at `root`.
pub fn settings(
    root: &Path,
    config: &DependencyResolverConfig,
    global: &GlobalConfig,
    info: &HostInfo,
    env: &EnvVars,
) -> io::Result<EngineSettings> {
    let base = Config::default().current::<Host>(root).map_err(|error| diagnostic(&error))?;
    settings_with_base(root, config, global, info, env, base)
}

pub(super) fn settings_with_base(
    root: &Path,
    config: &DependencyResolverConfig,
    global: &GlobalConfig,
    info: &HostInfo,
    env: &EnvVars,
    base: Config,
) -> io::Result<EngineSettings> {
    let enable_global_virtual_store = enable_global_virtual_store(config, global, env);
    Ok(EngineSettings {
        root: root.to_path_buf(),
        registry: registry_settings(&base, config, global)?,
        store: StoreSettings {
            store_dir: base.store_dir.clone().into(),
            cache_dir: base.cache_dir.clone(),
            pnpm_home_dir: pnpm_config::default_pnpm_home_dir::<Host>(),
            package_import_method: config.package_import_method.clone(),
        },
        layout: layout_settings(&base, config, info, enable_global_virtual_store),
        resolution: resolution_settings(&base, config, enable_global_virtual_store),
        policy: policy_settings(config, env)?,
        reporter: (!info.non_interactive).then(|| ReporterSettings::new(info)),
        base,
    })
}

fn registry_settings(
    base: &Config,
    config: &DependencyResolverConfig,
    global: &GlobalConfig,
) -> io::Result<RegistrySettings> {
    let registries = registries::resolve(base, config, global);
    Ok(RegistrySettings {
        auth_header_by_uri: registries.auth_header_by_uri(),
        registries,
        cloud_user_agent: !base.explicit_settings.contains_key("userAgent"),
        proxy: network::proxy(base, config, global),
        network: network::network(base, config, global)?,
    })
}

fn layout_settings(
    base: &Config,
    config: &DependencyResolverConfig,
    info: &HostInfo,
    enable_global_virtual_store: bool,
) -> LayoutSettings {
    LayoutSettings {
        node_linker: config.node_linker().to_string(),
        root_components: config.has_root_components(),
        hoist_pattern: hoist_pattern(
            config.hoist_patterns.as_deref(),
            base.hoist_pattern.as_deref(),
        ),
        public_hoist_pattern: public_hoist_pattern(base.shamefully_hoist),
        hoist_injected_dependencies: config.hoist_injected_dependencies.unwrap_or(false),
        enable_global_virtual_store,
        // `config.globalVirtualStoreDir ?? <storeDir>/links`, as the cascade derives it.
        global_virtual_store_dir: enable_global_virtual_store.then(|| {
            config.global_virtual_store_dir
                .as_ref()
                .map_or_else(|| base.global_virtual_store_dir.clone(), Into::into)
        }),
        bit_dir: info.bit_dir.clone(),
    }
}

fn resolution_settings(
    base: &Config,
    config: &DependencyResolverConfig,
    enable_global_virtual_store: bool,
) -> ResolutionSettings {
    ResolutionSettings {
        auto_install_peers: config.auto_install_peers.unwrap_or(true),
        dedupe_peers: config.dedupe_peers.unwrap_or(true),
        dedupe_injected_deps: false,
        engine_strict: config.engine_strict.unwrap_or(base.engine_strict),
        node_version: config.node_version.clone().or_else(|| base.node_version.clone()),
        patched_dependencies: config.patched_dependencies.clone(),
        package_extensions: package_extensions(
            config.package_extensions.as_ref(),
            enable_global_virtual_store,
        ),
        prefer_offline: config.prefer_offline,
    }
}

fn policy_settings(config: &DependencyResolverConfig, env: &EnvVars) -> io::Result<PolicySettings> {
    let allow_scripts = scripts::allowed_scripts(config, env.allow_scripts.as_deref())?;
    Ok(PolicySettings {
        scripts: scripts::resolve(
            allow_scripts.as_ref(),
            config.dangerously_allow_all_scripts.unwrap_or(false),
            config.never_built_dependencies.as_deref().unwrap_or_default(),
        ),
        minimum_release_age: config.minimum_release_age.unwrap_or(0),
        minimum_release_age_exclude: config.minimum_release_age_exclude.clone(),
        peer_dependency_rules: peer_dependency_rules(config.peer_dependency_rules.as_ref()),
    })
}

/// `enableGlobalVirtualStore()`: off under the hoisted linker; otherwise the
/// environment, then the workspace config, then Bit's global config.
fn enable_global_virtual_store(
    config: &DependencyResolverConfig,
    global: &GlobalConfig,
    env: &EnvVars,
) -> bool {
    if config.node_linker() == "hoisted" {
        return false;
    }
    if let Some(value) = env.enable_global_virtual_store
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        return value == "true" || value == "1";
    }
    if let Some(value) = config.enable_global_virtual_store {
        return value;
    }
    match global.get("enable_global_virtual_store") {
        Some(Value::Bool(value)) => *value,
        _ => matches!(global_string(global, "enable_global_virtual_store"), Some("true" | "1")),
    }
}

/// `resolveHoistPattern`: Bit's `hoistPatterns`, unless they are the default
/// `['*']` and the pnpm config sets a non-default pattern.
pub(super) fn hoist_pattern(
    from_bit: Option<&[String]>,
    from_pnpm: Option<&[String]>,
) -> Vec<String> {
    let is_default = |pattern: &[String]| pattern.len() == 1 && pattern[0] == "*";
    match (from_bit, from_pnpm) {
        (None, from_pnpm) => from_pnpm.map_or_else(|| vec!["*".to_string()], <[String]>::to_vec),
        (Some(from_bit), Some(from_pnpm)) if is_default(from_bit) && !is_default(from_pnpm) => {
            from_pnpm.to_vec()
        }
        (Some(from_bit), _) => from_bit.to_vec(),
    }
}

fn public_hoist_pattern(shamefully_hoist: bool) -> Vec<String> {
    let patterns: &[&str] = if shamefully_hoist {
        &["*"]
    } else {
        &["@eslint/plugin-*", "*eslint-plugin*", "@prettier/plugin-*", "*prettier-plugin-*"]
    };
    patterns
        .iter()
        .map(ToString::to_string)
        .collect()
}

/// `withBuiltInPackageExtensions`: under the global virtual store, teambit's
/// published envs that extend a phantom `@teambit/react` config get it as a
/// dependency. The user's extensions win.
fn package_extensions(
    from_config: Option<&IndexMap<String, Value>>,
    enable_global_virtual_store: bool,
) -> Option<IndexMap<String, Value>> {
    if !enable_global_virtual_store {
        return from_config.cloned();
    }
    let react = json!({ "dependencies": { "@teambit/react": "^1.0.0" } });
    let mut extensions: IndexMap<String, Value> = [
        ("@teambit/node.envs.node-babel-mocha@<3", react.clone()),
        ("@teambit/node.envs.node-typescript-mocha@<3", react.clone()),
        ("@teambit/react.internal.base-react-env@1", react.clone()),
        ("@teambit/rspack.envs.react-env@<2", react.clone()),
        ("@teambit/react.react-env@1", react),
        (
            "@teambit/cloud.envs.cloud-react@0",
            json!({ "dependencies": { "@teambit/rspack.envs.react-env": "^1.0.0" } }),
        ),
    ]
    .into_iter()
    .map(|(selector, extension)| (selector.to_string(), extension))
    .collect();
    extensions.extend(
        from_config
            .into_iter()
            .flatten()
            .map(|(key, value)| (key.clone(), value.clone())),
    );
    Some(extensions)
}

/// Peer-dependency warnings are suppressed by default; the workspace's own
/// rules override.
fn peer_dependency_rules(from_config: Option<&Value>) -> Value {
    let mut rules = json!({ "allowAny": ["*"], "ignoreMissing": ["*"] });
    if let (Some(rules), Some(Value::Object(configured))) = (rules.as_object_mut(), from_config) {
        rules.extend(configured.clone());
    }
    rules
}

#[cfg(test)]
mod tests;
