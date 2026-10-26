//! Root components: one `.bit_roots/<id>` project per env and app
//! (`_getRootManifests`).

use super::{
    ManifestInput,
    deps::{manifest_field, map_value, spread},
    versions::{CORE_ENVS, snap_to_semver, version_of, without_version},
};
use crate::model::{DependencyMap, Manifest, WorkspaceComponent};
use indexmap::IndexMap;
use serde_json::{Value, json};
use std::path::PathBuf;

fn in_workspace(input: &ManifestInput<'_>, id_without_version: &str) -> bool {
    input.components
        .iter()
        .any(|component| component.id.to_string_without_version() == id_without_version)
}

/// `getRootComponentDirByRootId`: workspace ids drop their version, `/` becomes `_`.
fn root_dir(input: &ManifestInput<'_>, id: &str) -> PathBuf {
    let bare = without_version(id);
    let name = if in_workspace(input, bare) { bare } else { id };
    input.options.root_components_dir.join(name.replace('/', "_"))
}

/// `_getEnvDependencies`: the env's forced own peers, `+` from the workspace dependencies.
fn env_dependencies(
    input: &ManifestInput<'_>,
    env_id: &str,
    workspace_deps: &DependencyMap,
) -> DependencyMap {
    let Some(policy) = input.policies.envs.get(env_id).filter(|policy| !policy.default_env) else {
        return DependencyMap::new();
    };
    policy.self_policy
        .iter()
        .filter(|entry| entry.force && entry.version != "-")
        .map(|entry| {
            let version = bit_object_import::plus_version::resolve(
                &entry.version,
                workspace_deps.get(&entry.name).map(String::as_str),
                "*",
            );
            (entry.name.clone(), version)
        })
        .collect()
}

/// `_getEnvPackage`: an external env's own package, pinned to the env version.
fn env_package(input: &ManifestInput<'_>, env_id: &str) -> DependencyMap {
    let bare = without_version(env_id);
    if CORE_ENVS.contains(&bare) || in_workspace(input, bare) {
        return DependencyMap::new();
    }
    match (input.context.env_packages.get(bare), version_of(env_id)) {
        (Some(package), Some(version)) => {
            DependencyMap::from([(package.clone(), snap_to_semver(version))])
        }
        _ => DependencyMap::new(),
    }
}

fn hoisting_limits() -> Value {
    json!({ "hoistingLimits": "workspaces" })
}

fn env_manifests(
    input: &ManifestInput<'_>,
    workspace_deps: &DependencyMap,
) -> IndexMap<PathBuf, Manifest> {
    let mut envs: Vec<&str> = Vec::new();
    for component in input.components {
        if !envs.contains(&component.env_id.as_str()) {
            envs.push(&component.env_id);
        }
    }
    envs.into_iter()
        .map(|env| {
            let own = env_dependencies(input, env, workspace_deps);
            let dependencies = spread(&[&own, workspace_deps, &env_package(input, env)]);
            let mut manifest = Manifest::new();
            manifest.insert("dependencies".into(), map_value(&dependencies));
            manifest.insert("installConfig".into(), hoisting_limits());
            (root_dir(input, env), manifest)
        })
        .collect()
}

/// `_getAppWorkspaceDeps`: workspace packages the app reaches through its
/// non-hidden component dependencies.
fn app_workspace_deps(
    input: &ManifestInput<'_>,
    app: &WorkspaceComponent,
    workspace_deps: &DependencyMap,
) -> DependencyMap {
    let mut walk =
        AppWalk { input, workspace_deps, found: DependencyMap::new(), visited: Vec::new() };
    walk.add(app);
    walk.found
}

/// The depth-first walk of `_getAppWorkspaceDeps`.
struct AppWalk<'a> {
    input: &'a ManifestInput<'a>,
    workspace_deps: &'a DependencyMap,
    found: DependencyMap,
    visited: Vec<String>,
}

impl AppWalk<'_> {
    fn found(&mut self, package_name: &str) {
        if let Some(spec) = self.workspace_deps.get(package_name) {
            self.found.insert(package_name.to_string(), spec.clone());
        }
    }

    fn add(&mut self, component: &WorkspaceComponent) {
        let id = component.id.to_string_without_version();
        if self.visited.contains(&id) {
            return;
        }
        self.visited.push(id.clone());
        self.found(&component.package_name);
        let input = self.input;
        let Some(deps) = input.dependencies.get(&id) else { return };
        for dep in deps.components.iter().filter(|dep| !dep.hidden) {
            let bare = dep.id.to_string_without_version();
            match input.components
                .iter()
                .find(|local| local.id.to_string_without_version() == bare)
            {
                Some(local) => self.add(local),
                None => self.found(&dep.package_name),
            }
        }
    }
}

fn app_manifest(
    input: &ManifestInput<'_>,
    app: &WorkspaceComponent,
    component_manifest: &Manifest,
    workspace_deps: &DependencyMap,
) -> Manifest {
    let mut manifest = component_manifest.clone();
    manifest.shift_remove("name");
    manifest.shift_remove("version");
    let own = env_dependencies(input, &app.env_id, workspace_deps);
    let app_deps = app_workspace_deps(input, app, workspace_deps);
    let dependencies =
        spread(&[&own, &manifest_field(component_manifest, "dependencies"), &app_deps]);
    manifest.insert("dependencies".into(), map_value(&dependencies));
    manifest.insert("installConfig".into(), hoisting_limits());
    manifest
}

fn app_manifests(
    input: &ManifestInput<'_>,
    manifests: &IndexMap<PathBuf, Manifest>,
    workspace_deps: &DependencyMap,
) -> IndexMap<PathBuf, Manifest> {
    let mut result = IndexMap::new();
    for app_id in input.context.apps {
        let Some(app) = input.components
            .iter()
            .find(|component| component.id.to_string_without_version() == *app_id)
        else {
            continue;
        };
        let name = Value::String(app.package_name.clone());
        let Some(component_manifest) = manifests
            .values()
            .find(|manifest| manifest.get("name") == Some(&name))
        else {
            continue;
        };
        let id = app.id.to_string_without_version();
        result.insert(
            root_dir(input, &id),
            app_manifest(input, app, component_manifest, workspace_deps),
        );
    }
    result
}

/// The `.bit_roots` projects for `manifests` (component manifests and the root).
pub(super) fn root_manifests(
    input: &ManifestInput<'_>,
    manifests: &IndexMap<PathBuf, Manifest>,
) -> IndexMap<PathBuf, Manifest> {
    let workspace_deps: DependencyMap = manifests
        .values()
        .filter_map(|manifest| manifest.get("name")?.as_str())
        .filter(|name| *name != "workspace")
        .map(|name| (name.to_string(), "workspace:*".to_string()))
        .collect();
    let mut result = env_manifests(input, &workspace_deps);
    result.extend(app_manifests(input, manifests, &workspace_deps));
    result
}

/// `hasComponentsFromWorkspaceInMissingDeps`: a manifest name some component misses.
pub(super) fn has_missing_local_components(
    input: &ManifestInput<'_>,
    manifests: &IndexMap<PathBuf, Manifest>,
) -> bool {
    let missing: Vec<&String> = input.components
        .iter()
        .filter_map(|component| input.dependencies.get(&component.id.to_string_without_version()))
        .flat_map(|deps| deps.missing_packages.runtime.iter().chain(&deps.missing_packages.dev))
        .collect();
    manifests
        .values()
        .filter_map(|manifest| manifest.get("name")?.as_str())
        .any(|name| {
            missing
                .iter()
                .any(|missing| *missing == name)
        })
}
