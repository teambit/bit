//! `ManifestDependenciesObject`: the dependency fields of one manifest.

use crate::model::{DependencyMap, Lifecycle, Manifest};
use indexmap::IndexMap;
use serde_json::{Map, Value, json};

/// A dependency field. `OptionalDependencies` doubles as the `optional-runtime`
/// lifecycle of the dedupe index.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum Field {
    Dependencies,
    OptionalDependencies,
    DevDependencies,
    PeerDependencies,
}

impl Field {
    /// The order `toDependenciesManifest` creates the fields in.
    pub(super) const ALL: [Field; 4] = [
        Field::Dependencies,
        Field::OptionalDependencies,
        Field::DevDependencies,
        Field::PeerDependencies,
    ];

    pub(super) const fn key(self) -> &'static str {
        match self {
            Field::Dependencies => "dependencies",
            Field::OptionalDependencies => "optionalDependencies",
            Field::DevDependencies => "devDependencies",
            Field::PeerDependencies => "peerDependencies",
        }
    }

    pub(super) const fn of(lifecycle: Lifecycle) -> Self {
        match lifecycle {
            Lifecycle::Runtime => Field::Dependencies,
            Lifecycle::Dev => Field::DevDependencies,
            Lifecycle::Peer => Field::PeerDependencies,
        }
    }

    const fn index(self) -> usize {
        self as usize
    }
}

/// The four dependency fields plus `peerDependenciesMeta`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct DepsObject {
    fields: [DependencyMap; 4],
    pub(super) peer_meta: IndexMap<String, bool>,
}

impl DepsObject {
    pub(super) fn get(&self, field: Field) -> &DependencyMap {
        &self.fields[field.index()]
    }

    pub(super) fn get_mut(&mut self, field: Field) -> &mut DependencyMap {
        &mut self.fields[field.index()]
    }

    pub(super) fn set(&mut self, field: Field, map: DependencyMap) {
        self.fields[field.index()] = map;
    }

    /// `deps[name] || devDeps[name] || peerDeps[name]` (JavaScript truthiness).
    pub(super) fn has_direct(&self, name: &str) -> bool {
        [Field::Dependencies, Field::DevDependencies, Field::PeerDependencies]
            .into_iter()
            .any(|field| truthy(self.get(field), name))
    }

    /// `manifest.toJson({ copyPeerToRuntime })` for `name` and `version`.
    pub(super) fn to_manifest(
        &self,
        name: &str,
        version: &str,
        copy_peer_to_runtime: bool,
    ) -> Manifest {
        let dependencies = if copy_peer_to_runtime {
            spread(&[self.get(Field::PeerDependencies), self.get(Field::Dependencies)])
        } else {
            self.get(Field::Dependencies).clone()
        };
        let meta: Map<String, Value> = self.peer_meta
            .iter()
            .filter_map(|(name, optional)| {
                let trimmed = name.trim();
                (!trimmed.is_empty()).then(|| (trimmed.to_owned(), json!({ "optional": optional })))
            })
            .collect();
        let mut manifest = Map::new();
        manifest.insert("name".into(), name.trim().into());
        manifest.insert("version".into(), version.trim().into());
        manifest.insert("dependencies".into(), map_value(&dependencies));
        for field in [Field::OptionalDependencies, Field::DevDependencies, Field::PeerDependencies]
        {
            manifest.insert(field.key().into(), map_value(self.get(field)));
        }
        manifest.insert("peerDependenciesMeta".into(), Value::Object(meta));
        manifest
    }
}

/// `map[name]` is set and not an empty string.
pub(super) fn truthy(map: &DependencyMap, name: &str) -> bool {
    map.get(name)
        .or_else(|| map.get(name.trim()))
        .map(|version| version.trim())
        .is_some_and(|version| !version.is_empty())
}

/// `{ ...a, ...b, ... }`: later maps win, keys keep their first position.
pub(super) fn spread(maps: &[&DependencyMap]) -> DependencyMap {
    let mut result = DependencyMap::new();
    for map in maps {
        for (name, version) in *map {
            let trimmed_name = name.trim();
            let trimmed_version = version.trim();
            if !trimmed_name.is_empty() && !trimmed_version.is_empty() {
                result.insert(trimmed_name.to_owned(), trimmed_version.to_owned());
            }
        }
    }
    result
}

pub(super) fn map_value(map: &DependencyMap) -> Value {
    Value::Object(
        map.iter()
            .map(|(name, version)| (name.clone(), Value::String(version.clone())))
            .collect(),
    )
}

/// The string entries of a manifest's dependency field.
pub(super) fn manifest_field(manifest: &Manifest, key: &str) -> DependencyMap {
    manifest
        .get(key)
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .filter_map(|(name, version)| {
                    let trimmed_name = name.trim();
                    let trimmed_version = version.as_str()?.trim();
                    (!trimmed_name.is_empty() && !trimmed_version.is_empty()).then(|| {
                        (trimmed_name.to_string(), trimmed_version.to_string())
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
