//! Package names of external envs: envs that are neither core envs nor
//! workspace components, as `getPackageName` names the env component.
//!
//! Resolves external environment package names from scope model metadata or default naming rules.

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
        if env.is_empty()
            || CORE_ENVS.contains(&env)
            || packages.contains_key(env)
            || components
                .iter()
                .any(|candidate| {
                    let name = candidate.id.name.trim().trim_matches('/');
                    env.ends_with(name) && candidate.id.to_string_without_version() == env
                })
        {
            continue;
        }
        let id = bare_id(env);
        let package = objects
            .aspect(component.env_id.trim())?
            .map(|model| model.package_name(&id))
            .filter(|pkg| !pkg.trim().is_empty())
            .unwrap_or_else(|| default_package_name(&id));
        packages.insert(env.to_owned(), package.trim().to_owned());
    }
    Ok(packages)
}

/// `scope/name` (the scope may contain dots, the name slashes).
#[inline]
fn bare_id(id: &str) -> ComponentId {
    let id = id.trim().trim_matches('/');
    let (scope, name) = id.split_once('/').unwrap_or(("", id));
    let scope = scope.trim().trim_matches('/');
    ComponentId {
        scope: (!scope.is_empty()).then(|| scope.to_owned()),
        default_scope: None,
        name: name.trim().trim_matches('/').to_owned(),
        version: None,
    }
}
