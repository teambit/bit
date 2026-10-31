//! The package names of external envs: envs that are neither core envs nor
//! workspace components, as `getPackageName` names the env component.

#[cfg(test)]
mod tests;

use super::{aspects::CORE_ENVS, scope_model::ScopeObjects};
use crate::{
    config::aspect_id_without_version,
    dependencies::default_package_name,
    model::{ComponentId, WorkspaceComponent},
};
use indexmap::IndexMap;
use std::io;

/// The package of every external env the components use, keyed by the env id
/// without its version: the name the scope records for the env at its version
/// (its `dependency-resolver` data, else its `teambit.pkg/pkg` config and binding
/// prefix), or the default name when the scope does not hold the env.
pub fn external_env_packages(
    components: &[WorkspaceComponent],
    objects: &ScopeObjects,
) -> io::Result<IndexMap<String, String>> {
    let mut packages = IndexMap::new();
    for component in components {
        let env = aspect_id_without_version(component.env_id.trim());
        if env.is_empty() {
            continue;
        }
        let local = components
            .iter()
            .any(|candidate| candidate.id.to_string_without_version() == env);
        if CORE_ENVS.contains(&env) || local || packages.contains_key(env) {
            continue;
        }
        let id = bare_id(env);
        let package = objects
            .aspect(&component.env_id)?
            .map_or_else(|| default_package_name(&id), |model| model.package_name(&id));
        packages.insert(env.to_owned(), package);
    }
    Ok(packages)
}

/// `scope/name` (the scope may contain dots, the name slashes).
fn bare_id(id: &str) -> ComponentId {
    let id = id.trim();
    let (scope, name) = id.split_once('/').unwrap_or(("", id));
    let scope = scope.trim();
    ComponentId {
        scope: (!scope.is_empty()).then(|| scope.to_owned()),
        default_scope: None,
        name: name.trim().to_owned(),
        version: None,
    }
}
