//! Apply the already-computed published package-manager arguments to pacquet.

use super::{Prepared, environment::CapturedHost, parse::Request};
use crate::{
    config::DependencyResolverConfig,
    engine::{EngineInstallOptions, EngineSettings, Registries, Registry},
    host::HostInfo,
    model::{GlobalConfig, InstallPlan},
};
use indexmap::IndexMap;
use pnpm_config::{Config, NodeLinker};
use serde_json::{Map, Value, json};
use std::path::PathBuf;

pub(super) fn prepare(request: &Request<'_>, info: &HostInfo) -> Option<Prepared> {
    let mut base = request.environment.with(|| {
        Config::default().current::<CapturedHost>(&request.paths.root).ok()
    })?;
    for (name, value) in &request.environment.vars {
        if name.eq_ignore_ascii_case("PATH") {
            continue;
        }
        base.extra_env.entry(name.clone()).or_insert_with(|| value.clone());
    }
    let mut settings = super::super::settings::settings_with_base(
        &request.paths.root,
        &DependencyResolverConfig::default(),
        &GlobalConfig::default(),
        info,
        &super::super::settings::EnvVars::default(),
        base,
    )
    .ok()?;
    apply_store(&mut settings, request)?;
    apply_registry(&mut settings, request)?;
    apply_network(&mut settings, request)?;
    apply_layout(&mut settings, request)?;
    apply_resolution(&mut settings, request)?;
    apply_policy(&mut settings, request)?;
    apply_reporter(&mut settings, request, info)?;
    let install_options = install_options(request)?;
    let plan = install_plan(request)?;
    let overlay = super::super::config_overlay::CallOverlay {
        overrides: &plan.overrides,
        forced_harmony_version: plan.forced_harmony_version.as_deref(),
        external_dependencies: &plan.external_dependencies,
        update_all: install_options.update_all,
    };
    super::super::config_overlay::install_config(&settings, &overlay).ok()?;
    Some((settings, install_options, plan))
}

fn apply_store(settings: &mut EngineSettings, request: &Request<'_>) -> Option<()> {
    settings.store.store_dir.clone_from(&request.paths.store);
    settings.store.cache_dir.clone_from(&request.paths.cache);
    settings.store.package_import_method = string(request.options, "packageImportMethod")?
        .map(|method| method.trim().to_owned())
        .filter(|method| !method.is_empty());
    if settings.store.package_import_method
        .as_deref()
        .is_some_and(|method| {
            !matches!(method, "auto" | "hardlink" | "copy" | "clone" | "clone-or-copy")
        })
    {
        return None;
    }
    settings.store.pnpm_home_dir = string(request.options, "pnpmHomeDir")?.map(PathBuf::from);
    Some(())
}

fn apply_registry(settings: &mut EngineSettings, request: &Request<'_>) -> Option<()> {
    let default = request.network.registry_map
        .get("default")?
        .as_str()?
        .trim()
        .to_string();
    if default.is_empty() {
        return None;
    }
    let mut registries = Registries {
        default: Registry { uri: default, ..Registry::default() },
        ..Registries::default()
    };
    for (key, value) in request.network.registry_map {
        if key == "default" {
            continue;
        }
        let scope = key.trim().strip_prefix('@')?.trim();
        let uri = value.as_str()?.trim();
        if scope.is_empty() || uri.is_empty() {
            return None;
        }
        registries.scopes.insert(
            scope.to_string(),
            Registry { uri: uri.to_string(), ..Registry::default() },
        );
    }
    settings.registry.registries = registries;
    settings.registry.auth_header_by_uri = string_map(request.network.auth_headers)?;
    settings.registry.cloud_user_agent = false;
    Some(())
}

fn apply_network(settings: &mut EngineSettings, request: &Request<'_>) -> Option<()> {
    let proxy = request.network.proxy;
    settings.registry.proxy.http_proxy = string(proxy, "httpProxy")?;
    settings.registry.proxy.https_proxy = string(proxy, "httpsProxy")?;
    settings.registry.proxy.no_proxy = optional(proxy, "noProxy")
        .filter(|value| !value.is_null())
        .cloned();
    if settings.registry.proxy.no_proxy
        .as_ref()
        .is_some_and(|value| !value.is_boolean() && !value.is_string())
    {
        return None;
    }
    let network = request.network.settings;
    let settings_network = &mut settings.registry.network;
    settings_network.max_sockets = integer(network, "maxSockets")?;
    settings_network.network_concurrency = integer(network, "networkConcurrency")?;
    settings_network.user_agent = string(network, "userAgent")?;
    settings_network.retry.fetch_retries = integer(network, "fetchRetries")?;
    settings_network.retry.fetch_retry_factor = integer(network, "fetchRetryFactor")?;
    settings_network.retry.fetch_retry_mintimeout = wide_integer(network, "fetchRetryMintimeout")?;
    settings_network.retry.fetch_retry_maxtimeout = wide_integer(network, "fetchRetryMaxtimeout")?;
    settings_network.retry.fetch_timeout = wide_integer(network, "fetchTimeout")?;
    settings_network.tls.ca = ca(network)?;
    settings_network.tls.cert = string(network, "cert")?;
    settings_network.tls.key = string(network, "key")?;
    settings_network.tls.local_address = string(network, "localAddress")?;
    settings_network.tls.strict_ssl = boolean(network, "strictSsl")?;
    Some(())
}

fn apply_layout(settings: &mut EngineSettings, request: &Request<'_>) -> Option<()> {
    let options = request.options;
    settings.layout.bit_dir.clone_from(&request.paths.bit);
    settings.layout.node_linker = string(options, "nodeLinker")?
        .map(|linker| linker.trim().to_owned())
        .filter(|linker| !linker.is_empty())
        .or_else(|| match settings.base.node_linker {
            NodeLinker::Isolated => Some("isolated".to_string()),
            NodeLinker::Hoisted => Some("hoisted".to_string()),
            _ => None,
        })?;
    if !matches!(settings.layout.node_linker.as_str(), "isolated" | "hoisted") {
        return None;
    }
    settings.layout.root_components = boolean(options, "rootComponents")?.unwrap_or(false);
    settings.layout.hoist_pattern =
        strings(options, "hoistPattern")?.unwrap_or_else(|| vec!["*".to_string()]);
    settings.layout.public_hoist_pattern = strings(options, "publicHoistPattern")?
        .or_else(|| settings.base.public_hoist_pattern.clone())?;
    settings.layout.hoist_injected_dependencies =
        boolean(options, "hoistInjectedDependencies")?.unwrap_or(false);
    settings.layout.enable_global_virtual_store = boolean(options, "enableGlobalVirtualStore")?
        .unwrap_or(settings.base.enable_global_virtual_store);
    settings.layout.global_virtual_store_dir =
        string(options, "globalVirtualStoreDir")?.map(PathBuf::from);
    if boolean(options, "rootComponentsForCapsules")? == Some(true)
        || boolean(options, "hoistWorkspacePackages")? == Some(true)
        || boolean(options, "ignorePackageManifest")? == Some(true)
        || boolean(options, "enableModulesDir")? == Some(false)
    {
        return None;
    }
    Some(())
}

fn apply_resolution(settings: &mut EngineSettings, request: &Request<'_>) -> Option<()> {
    let options = request.options;
    settings.resolution.auto_install_peers =
        boolean(options, "autoInstallPeers")?.unwrap_or(settings.base.auto_install_peers);
    settings.resolution.dedupe_peers =
        boolean(options, "dedupePeers")?.unwrap_or(settings.base.dedupe_peers);
    settings.resolution.dedupe_injected_deps =
        boolean(options, "dedupeInjectedDeps")?.unwrap_or(settings.base.dedupe_injected_deps);
    settings.resolution.engine_strict =
        boolean(options, "engineStrict")?.unwrap_or(settings.base.engine_strict);
    settings.resolution.node_version = string(options, "nodeVersion")?;
    settings.resolution.patched_dependencies = string_map_option(options, "patchedDependencies")?;
    settings.resolution.package_extensions = json_map_option(options, "packageExtensions")?;
    settings.resolution.prefer_offline = boolean(options, "preferOffline")?;
    if boolean(options, "excludeLinksFromLockfile")? == Some(false) {
        return None;
    }
    Some(())
}

fn apply_policy(settings: &mut EngineSettings, request: &Request<'_>) -> Option<()> {
    let options = request.options;
    let allow = json_map_option(options, "allowScripts")?;
    let dangerous = boolean(options, "dangerouslyAllowAllScripts")?.unwrap_or(false);
    let never = strings(options, "neverBuiltDependencies")?.unwrap_or_default();
    settings.policy.scripts = super::super::scripts::resolve(allow.as_ref(), dangerous, &never);
    settings.policy.minimum_release_age = wide_integer(options, "minimumReleaseAge")?.unwrap_or(0);
    settings.policy.minimum_release_age_exclude = strings(options, "minimumReleaseAgeExclude")?;
    let rules = request.options
        .get("reportOptions")
        .and_then(Value::as_object)
        .and_then(|report| report.get("peerDependencyRules"));
    settings.policy.peer_dependency_rules = json!({"allowAny":["*"],"ignoreMissing":["*"]});
    if let Some(Value::Object(rules)) = rules {
        settings.policy.peer_dependency_rules.as_object_mut()?.extend(rules.clone());
    } else if rules.is_some_and(|value| !value.is_null()) {
        return None;
    }
    Some(())
}

fn apply_reporter(
    settings: &mut EngineSettings,
    request: &Request<'_>,
    info: &HostInfo,
) -> Option<()> {
    if boolean(request.options, "hidePackageManagerOutput")? == Some(true) {
        settings.reporter = None;
        return Some(());
    }
    let empty = Map::new();
    let report = match request.options.get("reportOptions") {
        None | Some(Value::Null) => &empty,
        Some(Value::Object(report)) => report,
        _ => return None,
    };
    if !report
        .iter()
        .all(|(key, value)| {
            value.is_null()
                || matches!(
                    key.as_str(),
                    "appendOnly"
                        | "throttleProgress"
                        | "hideProgressPrefix"
                        | "hideLifecycleOutput"
                        | "peerDependencyRules",
                )
        })
    {
        return None;
    }
    if boolean(report, "hideProgressPrefix")? == Some(true)
        || boolean(report, "hideLifecycleOutput")? == Some(true)
    {
        return None;
    }
    let mut reporter = super::super::ReporterSettings::new(info);
    reporter.append_only = boolean(report, "appendOnly")?.unwrap_or(false);
    reporter
        .apply_throttle_progress(report.get("throttleProgress"))
        .ok()?;
    settings.reporter = Some(reporter);
    Some(())
}

fn install_options(request: &Request<'_>) -> Option<EngineInstallOptions> {
    let options = request.options;
    if boolean(options, "dryRun")? == Some(true)
        || boolean(options, "sideEffectsCacheRead")? == Some(false)
        || boolean(options, "sideEffectsCacheWrite")? == Some(false)
        || boolean(options, "returnListOfDepsRequiringBuild")? == Some(false)
    {
        return None;
    }
    Some(EngineInstallOptions {
        update_all: boolean(options, "updateAll")?.unwrap_or(false),
        lockfile_only: boolean(options, "lockfileOnly")?.unwrap_or(false),
        include_optional_deps: boolean(options, "includeOptionalDeps")?.unwrap_or(true),
        restore: None,
        output: None,
    })
}

fn install_plan(request: &Request<'_>) -> Option<InstallPlan> {
    let options = request.options;
    let root = &request.paths.root;
    let external_dependencies = if boolean(options, "rootComponents")?.unwrap_or(false) {
        request.projects
            .iter()
            .filter(|project| &project.dir != root)
            .filter_map(|project| {
                project.manifest
                    .get("name")?
                    .as_str()
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .map(str::to_string)
            })
            .collect::<indexmap::IndexSet<_>>()
            .into_iter()
            .collect()
    } else {
        Vec::new()
    };
    Some(InstallPlan {
        projects: request.projects.clone(),
        overrides: string_map_option(options, "overrides")?.unwrap_or_default(),
        forced_harmony_version: string(options, "forcedHarmonyVersion")?,
        external_dependencies,
    })
}

fn optional<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    map.get(key)
}

fn string(map: &Map<String, Value>, key: &str) -> Option<Option<String>> {
    match optional(map, key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::String(value)) => Some(Some(value.clone())),
        _ => None,
    }
}

fn boolean(map: &Map<String, Value>, key: &str) -> Option<Option<bool>> {
    match optional(map, key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::Bool(value)) => Some(Some(*value)),
        _ => None,
    }
}

fn wide_integer(map: &Map<String, Value>, key: &str) -> Option<Option<u64>> {
    match optional(map, key) {
        None | Some(Value::Null) => Some(None),
        Some(value) => value.as_u64().map(Some),
    }
}

fn integer(map: &Map<String, Value>, key: &str) -> Option<Option<u32>> {
    wide_integer(map, key)?
        .map(u32::try_from)
        .transpose()
        .ok()
}

fn strings(map: &Map<String, Value>, key: &str) -> Option<Option<Vec<String>>> {
    match optional(map, key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::Array(values)) => values
            .iter()
            .map(|value| value.as_str().map(str::to_string))
            .collect::<Option<_>>()
            .map(Some),
        _ => None,
    }
}

fn string_map(map: &Map<String, Value>) -> Option<IndexMap<String, String>> {
    map.iter()
        .map(|(key, value)| Some((key.clone(), value.as_str()?.to_string())))
        .collect()
}

fn string_map_option(
    map: &Map<String, Value>,
    key: &str,
) -> Option<Option<IndexMap<String, String>>> {
    match optional(map, key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::Object(value)) => string_map(value).map(Some),
        _ => None,
    }
}

fn json_map_option(map: &Map<String, Value>, key: &str) -> Option<Option<IndexMap<String, Value>>> {
    match optional(map, key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::Object(value)) => Some(Some(
            value
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect(),
        )),
        _ => None,
    }
}

fn ca(network: &Map<String, Value>) -> Option<Option<Vec<String>>> {
    match optional(network, "ca") {
        None | Some(Value::Null) => Some(None),
        Some(Value::String(value)) => Some(Some(vec![value.clone()])),
        Some(Value::Array(values)) => values
            .iter()
            .map(|value| value.as_str().map(str::to_string))
            .collect::<Option<_>>()
            .map(Some),
        _ => None,
    }
}
