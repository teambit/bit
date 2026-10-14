//! `linkDepsResolvedFromEnv` (`dependency-linker.ts`): a dependency a component
//! policy marks `resolveFromEnv` is linked at the root from where its env resolves it.

use super::root::{bvm_or, link_value};
use crate::{
    dependencies::default_package_name,
    host::HostInfo,
    model::{ComponentDependencies, ComponentId, DependencyMap, WorkspaceComponent},
    policy::split_version,
};
use indexmap::IndexMap;
use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

/// The root `link:` dependencies resolved from envs, and the messages for the
/// dependencies an env cannot resolve (`logger.console` in TypeScript).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct EnvLinks {
    pub links: DependencyMap,
    pub messages: Vec<String>,
}

/// The links of every component whose merged policy has `resolveFromEnv` entries,
/// keyed by package name in component and policy order. Callers add them only when
/// root components are off (`linkDepsResolvedFromEnv`).
#[must_use]
pub fn resolved_from_env_links(
    root: &Path,
    info: &HostInfo,
    components: &[WorkspaceComponent],
    dependencies: &IndexMap<String, ComponentDependencies>,
) -> EnvLinks {
    let mut result = EnvLinks::default();
    for component in components {
        let Some(data) = dependencies.get(&component.id.to_string_without_version()) else {
            continue;
        };
        let env_dir = env_dir(root, info, components, &component.env_id);
        for entry in data.policy.iter().filter(|entry| entry.resolve_from_env) {
            match resolve_module_dir(&env_dir, &entry.name) {
                Some(from) => {
                    result.links.insert(entry.name.clone(), link_value(&from));
                }
                None => result.messages.push(format!(
                    "could not resolve {} from env directory {}",
                    entry.name,
                    env_dir.display(),
                )),
            }
        }
    }
    result
}

/// The env's `aspectPath`: a core env's directory in the running bit, otherwise its
/// package in the workspace `node_modules` (`getComponentPackagePath`).
fn env_dir(
    root: &Path,
    info: &HostInfo,
    components: &[WorkspaceComponent],
    env_id: &str,
) -> PathBuf {
    let bare = split_version(env_id).0;
    if let Some(aspect) = info.core_aspects
        .iter()
        .find(|aspect| aspect.id == bare)
    {
        return bvm_or(info, aspect);
    }
    let package = components
        .iter()
        .find(|component| component.id.to_string_without_version() == bare)
        .map_or_else(
            || default_package_name(&component_id(bare)),
            |component| component.package_name.clone(),
        );
    root.join("node_modules").join(package)
}

fn component_id(id: &str) -> ComponentId {
    let (scope, name) = id.split_once('/').unwrap_or(("", id));
    ComponentId {
        scope: (!scope.is_empty()).then(|| scope.to_owned()),
        default_scope: None,
        name: name.to_owned(),
        version: None,
    }
}

/// `resolveModuleDirFromFile(resolveFrom.silent(fromDir, name), name)`: Node's
/// `node_modules` lookup from the real path of `from_dir`, returning the real
/// package directory.
fn resolve_module_dir(from_dir: &Path, name: &str) -> Option<PathBuf> {
    let real = fs::canonicalize(from_dir).ok()?;
    real.ancestors()
        .filter(|dir| dir.file_name() != Some(OsStr::new("node_modules")))
        .map(|dir| dir.join("node_modules").join(name))
        .find(|candidate| is_resolvable(candidate))
        .map(|candidate| fs::canonicalize(&candidate).unwrap_or(candidate))
}

/// A package directory Node resolves: a `package.json` or an `index.js`.
fn is_resolvable(dir: &Path) -> bool {
    dir.join("package.json").is_file() || dir.join("index.js").is_file()
}

#[cfg(test)]
mod tests;
