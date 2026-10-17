//! `WorkspaceManifestFactory.buildComponentDependenciesMap`: one dependencies
//! object per component package name.

mod env_peers;

use super::{
    ManifestInput,
    deps::{DepsObject, Field, spread},
    versions::{policy_version, snap_to_semver, without_version},
};
use crate::model::{
    ComponentDependencies, ComponentId, DependencyMap, Lifecycle, PolicyEntry, WorkspaceComponent,
};
use indexmap::IndexMap;

/// One entry of a `DependencyList`, package or component.
#[derive(Debug, Clone)]
pub(super) struct Dep<'a> {
    pub(super) package_name: &'a str,
    pub(super) version: String,
    pub(super) lifecycle: Lifecycle,
    pub(super) optional: bool,
    /// Set for component dependencies.
    pub(super) component: Option<&'a ComponentId>,
    pub(super) is_extension: bool,
    pub(super) hidden: bool,
}

impl Dep<'_> {
    /// `dependency.id`: the package name, or `scope/name@version`.
    fn id(&self) -> String {
        match self.component {
            Some(id) => match &id.version {
                Some(version) => format!("{}@{version}", id.to_string_without_version()),
                None => id.to_string_without_version(),
            },
            None => self.package_name.to_string(),
        }
    }
}

/// The component's `DependencyList`: component dependencies, then packages, unique by id.
pub(super) fn dependency_list(deps: &ComponentDependencies) -> Vec<Dep<'_>> {
    let components = deps.components
        .iter()
        .map(|dep| Dep {
            package_name: &dep.package_name,
            version: dep.id.version.clone().unwrap_or_default(),
            lifecycle: dep.lifecycle,
            optional: dep.optional,
            component: Some(&dep.id),
            is_extension: dep.is_extension,
            hidden: dep.hidden,
        });
    let packages = deps.packages
        .iter()
        .map(|dep| Dep {
            package_name: &dep.name,
            version: dep.version.clone(),
            lifecycle: dep.lifecycle,
            optional: dep.optional,
            component: None,
            is_extension: false,
            hidden: false,
        });
    let mut seen = Vec::new();
    components
        .chain(packages)
        .filter(|dep| {
            let id = dep.id();
            let new = !seen.contains(&id);
            seen.push(id);
            new
        })
        .collect()
}

/// `dependencyList.toDependenciesManifest()`.
pub(super) fn to_deps_object(list: &[Dep<'_>]) -> DepsObject {
    let mut object = DepsObject::default();
    for dep in list {
        let field = if dep.optional && dep.lifecycle == Lifecycle::Runtime {
            Field::OptionalDependencies
        } else {
            Field::of(dep.lifecycle)
        };
        object
            .get_mut(field)
            .insert(dep.package_name.to_string(), snap_to_semver(&dep.version));
        if dep.optional && dep.lifecycle == Lifecycle::Peer {
            object.peer_meta.insert(dep.package_name.to_string(), true);
        }
    }
    object
}

fn same_id(left: &ComponentId, right: &ComponentId) -> bool {
    left.to_string_without_version() == right.to_string_without_version()
}

/// `filterComponents`: drop dependencies the workspace provides itself.
fn filter_components<'a>(list: Vec<Dep<'a>>, components: &[WorkspaceComponent]) -> Vec<Dep<'a>> {
    list.into_iter()
        .filter(|dep| match dep.component {
            None => !components
                .iter()
                .any(|component| component.package_name == dep.package_name),
            Some(id) => {
                id.version.is_some()
                    && !components.iter().any(|component| same_id(&component.id, id))
            }
        })
        .collect()
}

/// `generateFilterFnForDepsFromLocalRemote`: component dependencies from a
/// remote listed in `scope.json` have no package unless a registry serves the scope.
fn from_registry(dep: &Dep<'_>, input: &ManifestInput<'_>) -> bool {
    let (Some(id), Some(filter)) = (dep.component, input.context.remote_filter) else {
        return true;
    };
    let Some(scope) = id.effective_scope() else { return true };
    !filter.local_remotes
        .iter()
        .any(|remote| remote == scope)
        || filter.registry_scopes
            .iter()
            .any(|registry| dep.package_name.starts_with(&format!("@{registry}/")))
}

/// `updateDependencyVersion`: component policy, then workspace policy, then the dependency.
fn update_version(
    dep: &mut Dep<'_>,
    component_policy: &[PolicyEntry],
    root_policy: &[PolicyEntry],
) {
    let from_component = policy_version(component_policy, dep.package_name, dep.lifecycle)
        .filter(|version| !version.is_empty() && !["-", "+", "*"].contains(version));
    let root_lifecycle =
        if dep.lifecycle == Lifecycle::Peer { Lifecycle::Peer } else { Lifecycle::Runtime };
    let from_root = policy_version(root_policy, dep.package_name, root_lifecycle)
        .filter(|version| !version.is_empty())
        .map(snap_to_semver);
    let own = Some(snap_to_semver(&dep.version)).filter(|version| !version.is_empty());
    dep.version = from_component
        .map(str::to_string)
        .or(from_root)
        .or(own)
        .unwrap_or_else(|| "0.0.1-new".to_string());
}

/// `referenceLocalPackages`: workspace components a component depends on, as `workspace:*`.
fn local_references(list: &[Dep<'_>], input: &ManifestInput<'_>) -> DependencyMap {
    let core_ids: Vec<&str> = input.context.core_aspects
        .iter()
        .map(|aspect| aspect.id.as_str())
        .collect();
    let mut references = DependencyMap::new();
    for dep in list {
        let Some(id) = dep.component.filter(|_| !dep.is_extension) else { continue };
        if core_ids.contains(&without_version(&dep.id())) {
            continue;
        }
        let local = input.components
            .iter()
            .find(|component| same_id(&component.id, id) && component.id.version == id.version);
        if let Some(local) = local.filter(|local| local.package_name != "@teambit/harmony") {
            references.insert(local.package_name.clone(), "workspace:*".to_string());
        }
    }
    references
}

fn missing(deps: &ComponentDependencies) -> (Vec<String>, Vec<String>) {
    let mut runtime: Vec<String> = Vec::new();
    for name in &deps.missing_packages.runtime {
        if !runtime.contains(name) {
            runtime.push(name.clone());
        }
    }
    let mut dev: Vec<String> = Vec::new();
    for name in &deps.missing_packages.dev {
        if !dev.contains(name) && !runtime.contains(name) {
            dev.push(name.clone());
        }
    }
    (runtime, dev)
}

/// Root policy runtime dependencies a component misses on the file system.
fn missing_root(
    root_dependencies: &DependencyMap,
    missing: &[String],
    before: &DepsObject,
) -> DependencyMap {
    root_dependencies
        .iter()
        .filter(|(name, _)| missing.contains(name) && !before.has_direct(name))
        .map(|(name, version)| (name.clone(), version.clone()))
        .collect()
}

/// The dependencies left after filtering, versioned for installation.
fn installed(
    list: Vec<Dep<'_>>,
    deps: &ComponentDependencies,
    input: &ManifestInput<'_>,
    root: &RootPolicy<'_>,
) -> DepsObject {
    let mut list: Vec<Dep<'_>> = filter_components(list, input.components)
        .into_iter()
        .filter(|dep| dep.package_name != "@teambit/legacy" && from_registry(dep, input))
        .collect();
    for dep in &mut list {
        update_version(dep, &deps.policy, root.entries);
    }
    to_deps_object(&list)
}

/// Root policy dependencies missing from the runtime and dev files.
fn missing_roots(
    deps: &ComponentDependencies,
    before: &DepsObject,
    root: &RootPolicy<'_>,
) -> (DependencyMap, DependencyMap) {
    let (runtime, dev) = missing(deps);
    (
        missing_root(&root.dependencies, &runtime, before),
        missing_root(&root.dependencies, &dev, before),
    )
}

/// The component's dependencies object (`buildResultsP` for one component).
fn component_deps(
    component: &WorkspaceComponent,
    input: &ManifestInput<'_>,
    root: &RootPolicy<'_>,
) -> DepsObject {
    let empty = ComponentDependencies::default();
    let deps = input.dependencies
        .get(&component.id.to_string_without_version())
        .unwrap_or(&empty);
    let list = dependency_list(deps);
    let additional = if input.options.reference_local_packages() {
        local_references(&list, input)
    } else {
        DependencyMap::new()
    };
    let before = to_deps_object(&list);
    let mut object = installed(list, deps, input, root);
    let (runtime_root, dev_root) = missing_roots(deps, &before, root);
    let env_peers = if input.options.resolve_env_peers_from_root {
        DependencyMap::new()
    } else if input.options.include_all_env_peers {
        env_peers::legacy_env_peers(component, deps, input)
    } else {
        let all = env_peers::legacy_env_peers(component, deps, input);
        env_peers::used_env_peers(&all, component, &before)
    };
    let dependencies =
        spread(&[&env_peers, &runtime_root, &additional, object.get(Field::Dependencies)]);
    let dev_dependencies = spread(&[&dev_root, object.get(Field::DevDependencies)]);
    object.set(Field::Dependencies, dependencies);
    object.set(Field::DevDependencies, dev_dependencies);
    object
}

/// The (core-aspect filtered) workspace policy and, with root components, its
/// runtime dependencies as a manifest field.
pub(super) struct RootPolicy<'a> {
    pub(super) entries: &'a [PolicyEntry],
    pub(super) dependencies: DependencyMap,
}

/// `buildComponentDependenciesMap`, keyed by component package name.
pub(super) fn build(
    input: &ManifestInput<'_>,
    root: &RootPolicy<'_>,
) -> IndexMap<String, DepsObject> {
    input.components
        .iter()
        .map(|component| (component.package_name.clone(), component_deps(component, input, root)))
        .collect()
}

#[cfg(test)]
mod tests;
