//! `_getEnvPeerDependencies`: env peers injected into each component when
//! `resolveEnvPeersFromRoot` is disabled.
//!
//! Resolves `+` peer placeholders from [`ComponentDependencies`] or defaults them to `*`.

use super::{
    super::{
        ManifestInput,
        deps::{DepsObject, truthy},
    },
    dependency_list,
};
use crate::{
    config::DEPENDENCY_RESOLVER_ASPECT,
    manifests::versions::snap_to_semver,
    model::{ComponentDependencies, DependencyMap, WorkspaceComponent},
};
use serde_json::Value;

/// Return the resolved version of a non-hidden dependency named `name` (`findByPkgNameOrCompId`) in `deps`.
#[inline]
fn found_version(deps: &ComponentDependencies, name: &str) -> Option<String> {
    let name = name.trim();
    dependency_list(deps)
        .into_iter()
        .filter(|dep| !dep.hidden)
        .find(|dep| {
            dep.package_name.trim() == name
                || dep.component.is_some_and(|id| id.to_string_without_version() == name)
        })
        .map(|dep| dep.version.trim().to_owned())
        .filter(|version| !version.is_empty())
}

/// The env's own peers minus workspace packages, `+` resolved from the
/// component's dependencies (`*` when it has none).
pub(super) fn legacy_env_peers(
    component: &WorkspaceComponent,
    deps: &ComponentDependencies,
    input: &ManifestInput<'_>,
) -> DependencyMap {
    let Some(env) = input.policies.envs
        .get(&component.env_id)
        .or_else(|| input.policies.envs.get(component.env_id.trim()))
    else {
        return DependencyMap::new();
    };
    let mut peers = DependencyMap::new();
    for entry in &env.self_policy {
        let name = entry.name.trim();
        if name.is_empty()
            || input.components
                .iter()
                .any(|local| local.package_name.trim() == name)
        {
            continue;
        }
        let resolved = bit_object_import::plus_version::is_plus(&entry.version)
            .then(|| found_version(deps, name).map(|version| snap_to_semver(&version)))
            .flatten();
        let version =
            bit_object_import::plus_version::resolve(&entry.version, resolved.as_deref(), "*");
        peers.insert(name.to_owned(), version);
    }
    peers
}

/// `includeAllEnvPeers: false`: the env peers the component depends on (before
/// filtering) or lists in its own dependency-resolver policy, and the env's
/// `react-dom` along with `react`.
pub(super) fn used_env_peers(
    all: &DependencyMap,
    component: &WorkspaceComponent,
    before: &DepsObject,
) -> DependencyMap {
    let explicit = explicit_packages(component);
    let mut used: DependencyMap = all
        .iter()
        .filter(|(name, _)| before.has_direct(name) || explicit.contains(name))
        .map(|(name, version)| (name.clone(), version.clone()))
        .collect();
    if truthy(&used, "react")
        && truthy(all, "react-dom")
        && let Some(react_dom) = all.get("react-dom")
    {
        used.insert("react-dom".to_string(), react_dom.clone());
    }
    used
}

/// Return the package names configured in `component`'s own `dependency-resolver` policy (`getComponentExplicitPackages`), excluding `-` removals.
#[inline]
fn explicit_packages(component: &WorkspaceComponent) -> Vec<String> {
    let Some(policy) = component.config
        .get(DEPENDENCY_RESOLVER_ASPECT)
        .and_then(|config| config.get("policy"))
    else {
        return Vec::new();
    };
    ["dependencies", "devDependencies", "peerDependencies"]
        .into_iter()
        .flat_map(|field| section_packages(policy.get(field)))
        .collect()
}

#[inline]
fn section_packages(section: Option<&Value>) -> Vec<String> {
    match section {
        Some(Value::Object(entries)) => entries
            .iter()
            .filter(|(_, spec)| !is_removal(spec))
            .map(|(name, _)| name.trim().to_owned())
            .filter(|name| !name.is_empty())
            .collect(),
        Some(Value::Array(items)) => items
            .iter()
            .filter(|item| !is_removal(item))
            .filter_map(|item| {
                item.get("name")
                    .or_else(|| item.get("packageName"))
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .map(str::to_owned)
            })
            .collect(),
        _ => Vec::new(),
    }
}

#[inline]
fn is_removal(spec: &Value) -> bool {
    [
        spec.as_str(),
        spec.get("version").and_then(Value::as_str),
        spec.get("supportedRange").and_then(Value::as_str),
    ]
    .into_iter()
    .flatten()
    .any(|val| val.trim() == "-")
}
