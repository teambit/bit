//! Consume pre-install mutations after manifest calculation, before the package engine.
use super::{Calculated, Loaded};
use crate::{
    engine::{EngineInstallOptions, EngineSettings},
    model::InstallPlan,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn apply(
    root: &Path,
    calculated: &Calculated,
    loaded: &Loaded,
    receipt: Option<&Value>,
    options: &mut EngineInstallOptions,
) -> io::Result<(InstallPlan, EngineSettings)> {
    let mut plan = calculated.outcome.plan.clone();
    let mut settings = loaded.engine.clone();
    if let Some(receipt) = receipt.filter(|value| !value.is_null()) {
        validate_changes(&receipt["packageManagerChanges"])?;
        crate::manifests::subscriber_links(
            root,
            &mut plan,
            &calculated.outcome.pre_link_projects,
            &receipt["options"],
        )?;
        let changed = &receipt["packageManagerChanges"];
        assign(changed, "updateAll", &mut options.update_all)?;
        assign(changed, "lockfileOnly", &mut options.lockfile_only)?;
        assign(changed, "includeOptionalDeps", &mut options.include_optional_deps)?;
        assign(changed, "overrides", &mut plan.overrides)?;
        assign(changed, "forcedHarmonyVersion", &mut plan.forced_harmony_version)?;
        layout(changed, &mut settings)?;
        resolution(changed, &mut settings)?;
        if let Some(reporter) = settings.reporter.as_mut() {
            reporter.apply_throttle_progress(changed.get("throttleProgress"))?;
        }
        cleanup(root, receipt)?;
    }
    Ok((plan, settings))
}

fn validate_changes(values: &Value) -> io::Result<()> {
    let supported = [
        "updateAll",
        "lockfileOnly",
        "includeOptionalDeps",
        "overrides",
        "forcedHarmonyVersion",
        "nodeLinker",
        "rootComponents",
        "hoistPatterns",
        "hoistInjectedDependencies",
        "enableGlobalVirtualStore",
        "globalVirtualStoreDir",
        "packageImportMethod",
        "cacheRootDir",
        "autoInstallPeers",
        "dedupePeers",
        "dedupeInjectedDeps",
        "engineStrict",
        "nodeVersion",
        "patchedDependencies",
        "packageExtensions",
        "preferOffline",
        "minimumReleaseAge",
        "minimumReleaseAgeExclude",
        "peerDependencyRules",
        "throttleProgress",
    ];
    let fields =
        values.as_object().ok_or_else(|| io::Error::other("subscriber PM change receipt"))?;
    if let Some(key) = fields
        .keys()
        .find(|key| !supported.contains(&key.as_str()))
    {
        return Err(io::Error::other(format!(
            "native lane installation subscriber mutation is not yet supported: {key}",
        )));
    }
    Ok(())
}

fn non_empty_dir(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
}

fn cleanup(root: &Path, receipt: &Value) -> io::Result<()> {
    if receipt["cleanComponents"] != true {
        return Ok(());
    }
    let entries = receipt["componentDirectories"]
        .as_array()
        .filter(|entries| entries.len() <= 8192)
        .ok_or_else(|| io::Error::other("subscriber component directory receipt"))?;
    for entry in entries {
        let directory = non_empty_dir(entry)
            .or_else(|| non_empty_dir(&entry["directory"]))
            .or_else(|| non_empty_dir(&entry["rootDir"]))
            .map(Path::new)
            .filter(|directory| {
                directory.is_absolute() && directory.starts_with(root) && *directory != root
            })
            .ok_or_else(|| io::Error::other("subscriber component directory outside workspace"))?;
        // DependencyInstaller.cleanCompsNodeModules is best effort, before the PM runs.
        let _ = std::fs::remove_dir_all(directory.join("node_modules"));
    }
    Ok(())
}

fn layout(values: &Value, settings: &mut EngineSettings) -> io::Result<()> {
    assign(values, "nodeLinker", &mut settings.layout.node_linker)?;
    assign(values, "rootComponents", &mut settings.layout.root_components)?;
    assign(values, "hoistPatterns", &mut settings.layout.hoist_pattern)?;
    assign(values, "hoistInjectedDependencies", &mut settings.layout.hoist_injected_dependencies)?;
    assign(values, "enableGlobalVirtualStore", &mut settings.layout.enable_global_virtual_store)?;
    assign(values, "globalVirtualStoreDir", &mut settings.layout.global_virtual_store_dir)?;
    assign(values, "packageImportMethod", &mut settings.store.package_import_method)?;
    assign(values, "cacheRootDir", &mut settings.store.cache_dir)
}

fn resolution(values: &Value, settings: &mut EngineSettings) -> io::Result<()> {
    assign(values, "autoInstallPeers", &mut settings.resolution.auto_install_peers)?;
    assign(values, "dedupePeers", &mut settings.resolution.dedupe_peers)?;
    assign(values, "dedupeInjectedDeps", &mut settings.resolution.dedupe_injected_deps)?;
    assign(values, "engineStrict", &mut settings.resolution.engine_strict)?;
    assign(values, "nodeVersion", &mut settings.resolution.node_version)?;
    assign(values, "patchedDependencies", &mut settings.resolution.patched_dependencies)?;
    assign(values, "packageExtensions", &mut settings.resolution.package_extensions)?;
    assign(values, "preferOffline", &mut settings.resolution.prefer_offline)?;
    assign(values, "minimumReleaseAge", &mut settings.policy.minimum_release_age)?;
    assign(values, "minimumReleaseAgeExclude", &mut settings.policy.minimum_release_age_exclude)?;
    assign(values, "peerDependencyRules", &mut settings.policy.peer_dependency_rules)
}

fn assign<Setting: DeserializeOwned>(
    values: &Value,
    key: &str,
    target: &mut Setting,
) -> io::Result<()> {
    if let Some(value) = values
        .get(key)
        .filter(|value| !value.is_null())
    {
        *target = serde_json::from_value(value.clone())
            .map_err(|error| io::Error::other(format!("subscriber {key}: {error}")))?;
    }
    Ok(())
}
