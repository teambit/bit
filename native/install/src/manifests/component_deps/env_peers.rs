//! `_getEnvPeerDependencies`: env peers injected into each component when
//! `resolveEnvPeersFromRoot` is off.

use super::{super::ManifestInput, dependency_list};
use crate::{
    manifests::versions::snap_to_semver,
    model::{ComponentDependencies, DependencyMap, WorkspaceComponent},
};

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
    let Some(env) = input.policies.envs.get(&component.env_id) else { return DependencyMap::new() };
    let mut peers = DependencyMap::new();
    for entry in &env.self_policy {
        if input.components
            .iter()
            .any(|local| local.package_name == entry.name)
        {
            continue;
        }
        let version = if entry.version == "+" {
            found_version(deps, &entry.name)
                .map_or_else(|| "*".to_string(), |version| snap_to_semver(&version))
        } else {
            entry.version.clone()
        };
        peers.insert(entry.name.clone(), version);
    }
    peers
}
