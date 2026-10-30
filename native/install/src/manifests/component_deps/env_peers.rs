//! `_getEnvPeerDependencies`: env peers injected into each component when
//! `resolveEnvPeersFromRoot` is off.

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

/// The `version` of a non-hidden dependency named `name` (`findByPkgNameOrCompId`).
fn found_version(deps: &ComponentDependencies, name: &str) -> Option<String> {
    dependency_list(deps)
        .into_iter()
        .filter(|dep| !dep.hidden)
        .find(|dep| {
            dep.package_name == name
                || dep.component.is_some_and(|id| id.to_string_without_version() == name)
        })
        .map(|dep| dep.version)
        .filter(|version| !version.is_empty())
}

/// The env's own peers minus workspace packages, `+` resolved from the
/// component's dependencies (`*` when it has none).
pub(super) fn legacy_env_peers(
    component: &WorkspaceComponent,
    deps: &ComponentDependencies,
    input: &ManifestInput<'_>,
) -> DependencyMap {
    let Some(env) = input.policies.envs.get(&component.env_id) else {
        return DependencyMap::new();
    };
    let mut peers = DependencyMap::new();
    for entry in &env.self_policy {
        if input.components
            .iter()
            .any(|local| local.package_name == entry.name)
        {
            continue;
        }
        let resolved = found_version(deps, &entry.name).map(|version| snap_to_semver(&version));
        let version =
            bit_object_import::plus_version::resolve(&entry.version, resolved.as_deref(), "*");
        peers.insert(entry.name.clone(), version);
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

/// `getComponentExplicitPackages`: the names in the component's configured policy,
/// without removals (`-` or `{ version: "-" }`).
fn explicit_packages(component: &WorkspaceComponent) -> Vec<String> {
    let Some(policy) = component.config
        .get(DEPENDENCY_RESOLVER_ASPECT)
        .and_then(|config| config.get("policy"))
    else {
        return Vec::new();
    };
    ["dependencies", "devDependencies", "peerDependencies"]
        .into_iter()
        .filter_map(|field| policy.get(field)?.as_object())
        .flat_map(|section| section.iter())
        .filter(|(_, spec)| !is_removal(spec))
        .map(|(name, _)| name.clone())
        .collect()
}

fn is_removal(spec: &Value) -> bool {
    spec.as_str() == Some("-") || spec.get("version").and_then(Value::as_str) == Some("-")
}
