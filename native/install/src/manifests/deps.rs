//! `ManifestDependenciesObject`: the dependency fields of one manifest.
//!
//! Models `dependencies`, `optionalDependencies`, `devDependencies`, and `peerDependencies` maps via [`Field`].

use crate::model::{DependencyMap, Lifecycle, Manifest};
use indexmap::IndexMap;
use serde_json::{Map, Value, json};

/// A dependency field. `OptionalDependencies` doubles as the `optional-runtime`
/// lifecycle of the dedupe index.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum Field {
    #[default]
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

    /// Return the `package.json` dependency field name for `self`.
    #[inline]
    pub(super) const fn key(self) -> &'static str {
        match self {
            Field::Dependencies => "dependencies",
            Field::OptionalDependencies => "optionalDependencies",
            Field::DevDependencies => "devDependencies",
            Field::PeerDependencies => "peerDependencies",
        }
    }

    /// Map a [`Lifecycle`] (`Runtime`, `Dev`, `Peer`) to its corresponding [`Field`].
    #[inline]
    pub(super) const fn of(lifecycle: Lifecycle) -> Self {
        match lifecycle {
            Lifecycle::Runtime => Field::Dependencies,
            Lifecycle::Dev => Field::DevDependencies,
            Lifecycle::Peer => Field::PeerDependencies,
        }
    }

    /// Return the array slot index (`0..=3`) for `self` in [`DepsObject`].
    #[inline]
    const fn index(self) -> usize {
        self as usize
    }
}

/// The four dependency fields plus `peerDependenciesMeta`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct DepsObject {
    /// Per-field `[dependencies, optionalDependencies, devDependencies, peerDependencies]` maps.
    fields: [DependencyMap; 4],
    /// Optional peer dependency metadata flags (`peerDependenciesMeta.<pkg>.optional`).
    pub(super) peer_meta: IndexMap<String, bool>,
}

impl DepsObject {
    /// Borrow the [`DependencyMap`] for `field`.
    #[inline]
    pub(super) fn get(&self, field: Field) -> &DependencyMap {
        &self.fields[field.index()]
    }

    /// Mutably borrow the [`DependencyMap`] for `field`.
    #[inline]
    pub(super) fn get_mut(&mut self, field: Field) -> &mut DependencyMap {
        &mut self.fields[field.index()]
    }

    /// Replace the [`DependencyMap`] for `field` with `map`.
    #[inline]
    pub(super) fn set(&mut self, field: Field, map: DependencyMap) {
        self.fields[field.index()] = map;
    }

    /// `deps[name] || devDeps[name] || peerDeps[name]` (`JavaScript` [`truthy`] check).
    #[inline]
    pub(super) fn has_direct(&self, name: &str) -> bool {
        [Field::Dependencies, Field::DevDependencies, Field::PeerDependencies]
            .into_iter()
            .any(|field| truthy(self.get(field), name))
    }

    /// `manifest.toJson({ copyPeerToRuntime })` producing a [`Manifest`] for `name` and `version`.
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
#[inline]
pub(super) fn truthy(map: &DependencyMap, name: &str) -> bool {
    let trimmed = name.trim();
    map.get(name)
        .or_else(|| {
            (trimmed != name)
                .then(|| map.get(trimmed))
                .flatten()
        })
        .or_else(|| {
            map.iter()
                .find_map(|(key, val)| (key.trim() == trimmed).then_some(val))
        })
        .map(String::as_str)
        .map(str::trim)
        .is_some_and(|version| !version.is_empty())
}

/// `{ ...a, ...b, ... }`: later maps win, keys keep their first position.
#[inline]
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

#[inline]
pub(super) fn map_value(map: &DependencyMap) -> Value {
    Value::Object(
        map.iter()
            .filter_map(|(name, version)| {
                let (name, version) = (name.trim(), version.trim());
                (!name.is_empty() && !version.is_empty()).then(|| {
                    (name.to_owned(), Value::String(version.to_owned()))
                })
            })
            .collect(),
    )
}

/// The string entries of a manifest's dependency field.
#[inline]
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
