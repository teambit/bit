//! From deduped dependencies to engine projects: `getComponentsManifests`,
//! `toJson`, and the `linkedDependencies` merge of `installComponents`.

use super::{
    ManifestInput,
    dedupe::Deduped,
    deps::{DepsObject, Field, manifest_field, map_value, spread, truthy},
    env_root::EnvRoot,
    versions::snap_to_semver,
};
use crate::model::{DependencyMap, Manifest};
use indexmap::IndexMap;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// The component's manifest version: its snap as semver, `0.0.1-new` when new.
fn component_version(version: Option<&str>) -> String {
    version.map_or_else(|| "0.0.1-new".to_string(), snap_to_semver)
}

/// Component manifests keyed by component dir, conflicting env peers injected.
pub(super) fn component_manifests(
    input: &ManifestInput<'_>,
    deduped: &Deduped,
    env_root: &EnvRoot,
) -> IndexMap<PathBuf, Manifest> {
    let mut by_package: IndexMap<&str, Manifest> = IndexMap::new();
    for component in input.components {
        let mut deps = deduped.components
            .get(&component.package_name)
            .cloned()
            .unwrap_or_default();
        let env = super::versions::without_version(&component.env_id);
        if let Some(peers) = env_root.component_peers.get(env) {
            let merged = spread(&[peers, deps.get(Field::Dependencies)]);
            deps.set(Field::Dependencies, merged);
        }
        let version = component_version(component.id.version.as_deref());
        let copy = input.options.copy_peer_to_runtime_on_components;
        by_package.insert(
            &component.package_name,
            deps.to_manifest(&component.package_name, &version, copy),
        );
    }
    input.components
        .iter()
        .filter_map(|component| {
            Some((component.dir.clone(), by_package.get(component.package_name.as_str())?.clone()))
        })
        .collect()
}

/// `_resolvePlusVersions`: `+` takes the root's own version of the package, or `*`.
fn resolve_plus(peers: &DependencyMap, root: &DepsObject) -> DependencyMap {
    let lookup = [
        Field::Dependencies,
        Field::OptionalDependencies,
        Field::DevDependencies,
        Field::PeerDependencies,
    ];
    peers
        .iter()
        .map(|(name, version)| {
            if !bit_object_import::plus_version::is_plus(version) {
                return (name.clone(), version.clone());
            }
            let found = lookup
                .iter()
                .find(|field| truthy(root.get(**field), name))
                .map(|field| root.get(*field)[name].clone());
            (name.clone(), bit_object_import::plus_version::resolve(version, found.as_deref(), "*"))
        })
        .collect()
}

/// `WorkspaceManifest.toJson`: env peers are defaults the root's own entries override.
pub(super) fn root_manifest(
    input: &ManifestInput<'_>,
    root: &DepsObject,
    env_root: &EnvRoot,
) -> Manifest {
    let mut manifest =
        root.to_manifest("workspace", "1.0.0", input.options.copy_peer_to_runtime_on_root);
    if !input.options.root_env_peers {
        return manifest;
    }
    let mut dependencies = manifest_field(&manifest, "dependencies");
    let defined: Vec<DependencyMap> =
        ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
            .into_iter()
            .map(|key| manifest_field(&manifest, key))
            .collect();
    for (name, version) in resolve_plus(&env_root.peers, root) {
        if !defined.iter().any(|map| truthy(map, &name)) {
            dependencies.insert(name, version);
        }
    }
    manifest.insert("dependencies".into(), map_value(&dependencies));
    manifest
}

fn direct_dependency_names(manifests: &IndexMap<PathBuf, Manifest>) -> Vec<String> {
    let mut names = Vec::new();
    for manifest in manifests.values() {
        for key in ["dependencies", "devDependencies"] {
            names.extend(manifest_field(manifest, key).into_keys());
        }
    }
    names
}

/// `installComponents`' `linkedDependencies` merge into the root manifest.
pub(super) fn merge_linked(
    manifests: &mut IndexMap<PathBuf, Manifest>,
    input: &ManifestInput<'_>,
    forced_harmony_version: Option<&str>,
) {
    merge_linked_root(
        manifests,
        input.root,
        input.context.linked_root_deps.clone(),
        forced_harmony_version,
    );
}

pub(super) fn merge_linked_root(
    manifests: &mut IndexMap<PathBuf, Manifest>,
    root: &Path,
    mut linked: DependencyMap,
    forced_harmony_version: Option<&str>,
) {
    let root = root.to_path_buf();
    if let Some(root_manifest) = manifests.get_mut(&root) {
        let mut dependencies = manifest_field(root_manifest, "dependencies");
        if forced_harmony_version.is_none()
            && dependencies.shift_remove("@teambit/harmony").is_some()
        {
            root_manifest.insert("dependencies".into(), map_value(&dependencies));
        }
    }
    let direct = direct_dependency_names(manifests);
    for manifest in manifests.values() {
        if let Some(name) = manifest
            .get("name")
            .and_then(Value::as_str)
            .filter(|name| direct.iter().any(|dep| dep == name))
        {
            linked.shift_remove(name);
        }
    }
    let root_manifest = manifests.entry(root).or_default();
    let merged = spread(&[&linked, &manifest_field(root_manifest, "dependencies")]);
    root_manifest.insert("dependencies".into(), map_value(&merged));
    if !root_manifest.contains_key("dependenciesMeta") {
        root_manifest.insert("dependenciesMeta".into(), Value::Object(serde_json::Map::new()));
    }
}

/// `harmonyVersionInRootPolicy`: `@teambit/harmony` in the `workspace.jsonc` policy.
pub(super) fn forced_harmony_version(input: &ManifestInput<'_>) -> Option<String> {
    ["dependencies", "peerDependencies"]
        .into_iter()
        .find_map(|key| {
            let value = input.config.policy.get(key)?.get("@teambit/harmony")?;
            value
                .as_str()
                .or_else(|| value.get("version")?.as_str())
                .map(str::to_string)
        })
}

/// `externalDependencies` of the engine with root components: non-root manifest names.
pub(super) fn external_dependencies(
    input: &ManifestInput<'_>,
    manifests: &IndexMap<PathBuf, Manifest>,
) -> Vec<String> {
    if !input.options.has_root_components {
        return Vec::new();
    }
    let mut names: Vec<String> = Vec::new();
    for (dir, manifest) in manifests {
        let Some(name) = manifest.get("name").and_then(Value::as_str) else {
            continue;
        };
        if dir.as_path() != input.root
            && !names
                .iter()
                .any(|existing| existing == name)
        {
            names.push(name.to_string());
        }
    }
    names
}
