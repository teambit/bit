//! Resolve a package spec to a concrete version for `bit install <pkg>`
//! (`resolveRemoteVersion` in `lynx.ts`).

#[cfg(test)]
mod tests;

use super::{
    EngineSettings,
    config_overlay::{Query, http_client, query_config},
    error::diagnostic,
};
use pnpm_resolving_default_resolver::standalone::{StandaloneChainOptions, build_standalone_chain};
use pnpm_resolving_resolver_base::{
    ResolveOptions, ResolveResult, ResolverProjectOptions, WantedDependency,
};
use serde_json::Value;
use std::io;

/// `ResolvedPackageVersion`.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedVersion {
    pub package_name: String,
    /// The resolved version, or the normalized spec of a non-registry
    /// dependency (git URL, path).
    pub version: String,
    /// The requested range, when it is a valid semver range.
    pub wanted_range: Option<String>,
    pub is_semver: bool,
    pub resolved_via: String,
    pub manifest: Option<Value>,
}

/// Resolve `spec` (`name`, `name@range`, a git URL or a path) from `settings.root`.
pub async fn resolve_remote_version(
    spec: &str,
    settings: &EngineSettings,
) -> io::Result<ResolvedVersion> {
    let trimmed = spec.trim();
    let parsed = parse_package_name(trimmed);
    let settings = settings.clone();
    let spec = trimmed.to_string();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("bit-install-resolve".to_string())
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            let _ = sender.send(resolve_blocking(&spec, parsed, &settings));
        })?;
    receiver.await.map_err(|_| io::Error::other("the resolve thread panicked"))?
}

fn resolve_blocking(
    spec: &str,
    parsed: Option<(String, String)>,
    settings: &EngineSettings,
) -> io::Result<ResolvedVersion> {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    if let Some((name, version)) = parsed {
        runtime.block_on(resolve_package(name, version, settings))
    } else {
        // Probably a git URL or the path of a directory.
        runtime.block_on(resolve_spec(spec, settings))
    }
}

/// `name` or `name@range` from the registry.
async fn resolve_package(
    name: String,
    version: String,
    settings: &EngineSettings,
) -> io::Result<ResolvedVersion> {
    let trimmed_ver = version.trim().to_string();
    let bare_specifier = (!trimmed_ver.is_empty()).then(|| trimmed_ver.clone());
    let wanted =
        WantedDependency { alias: Some(name), bare_specifier, ..WantedDependency::default() };
    let resolved = resolve(&wanted, settings).await?;
    let manifest = manifest_of(&resolved)?;
    Ok(ResolvedVersion {
        package_name: manifest_field(&manifest, "name"),
        version: manifest_field(&manifest, "version"),
        wanted_range: (!trimmed_ver.is_empty()
            && trimmed_ver.parse::<node_semver::Range>().is_ok())
        .then_some(trimmed_ver),
        is_semver: true,
        resolved_via: resolved.resolved_via,
        manifest: Some(manifest),
    })
}

/// A spec that is not a package name; its version is the normalized spec.
async fn resolve_spec(spec: &str, settings: &EngineSettings) -> io::Result<ResolvedVersion> {
    let wanted = WantedDependency {
        alias: None,
        bare_specifier: Some(spec.to_string()),
        ..WantedDependency::default()
    };
    let resolved = resolve(&wanted, settings).await?;
    let manifest = manifest_of(&resolved)?;
    let version = resolved.normalized_bare_specifier
        .clone()
        .ok_or_else(|| io::Error::other("The resolved package has no version"))?;
    Ok(ResolvedVersion {
        package_name: manifest_field(&manifest, "name"),
        version,
        wanted_range: None,
        is_semver: false,
        resolved_via: resolved.resolved_via,
        manifest: Some(manifest),
    })
}

async fn resolve(
    wanted: &WantedDependency,
    settings: &EngineSettings,
) -> io::Result<ResolveResult> {
    let config = query_config(settings, &Query::Resolve);
    let client = http_client(config)?;
    let resolver = build_standalone_chain(&StandaloneChainOptions {
        config,
        http_client: &client,
        full_metadata: false,
        filter_metadata: false,
    })
    .map_err(|error| diagnostic(&error))?;
    let options = ResolveOptions {
        project: ResolverProjectOptions {
            project_dir: settings.root.clone(),
            lockfile_dir: settings.root.clone(),
            ..ResolverProjectOptions::default()
        },
        ..ResolveOptions::default()
    };
    resolver.resolve(wanted, &options).await.map_err(|error| io::Error::other(error.to_string()))
}

fn manifest_of(resolved: &ResolveResult) -> io::Result<Value> {
    resolved.package.manifest
        .as_deref()
        .cloned()
        .ok_or_else(|| io::Error::other("The resolved package has no manifest"))
}

fn manifest_field(manifest: &Value, field: &str) -> String {
    manifest
        .get(field)
        .and_then(Value::as_str)
        .map_or("", str::trim)
        .to_string()
}

/// `parse-package-name`: `(name, version)`, or `None` when the input is not a
/// package name (its "is not a valid string" error). The path part of
/// `name/path@version` is dropped, as Bit drops it.
pub(super) fn parse_package_name(input: &str) -> Option<(String, String)> {
    const SCOPED: &str = r"^(@[^/]+\/[^/@]+)(?:\/([^@]+))?(?:@([\s\S]+))?";
    const NORMAL: &str = r"^([^/@]+)(?:\/([^@]+))?(?:@([\s\S]+))?";
    let pattern = if input.starts_with('@') { SCOPED } else { NORMAL };
    let regex = regress::Regex::new(pattern).ok()?;
    let found = regex.find(input)?;
    let group = |index| {
        found
            .group(index)
            .map_or("", |range| input[range].trim())
    };
    Some((group(1).to_string(), group(3).to_string()))
}
