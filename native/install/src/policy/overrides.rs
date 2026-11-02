//! Legacy overrides views of a merged component policy
//! (`toLegacyAutoDetectOverrides`, `toLegacyDepsOverrides`).
//!
//! Splits merged [`PolicyEntry`] slices into forced, non-forced, and ignored ([`REMOVE`]) [`FieldMaps`].

use crate::model::{Lifecycle, PolicyEntry};
use indexmap::IndexMap;

/// `{ dependencies, devDependencies, peerDependencies }` name → version maps,
/// indexed by [`field_index`].
pub type FieldMaps = [IndexMap<String, String>; 3];

/// `-`: remove the dependency (`MANUALLY_REMOVE_DEPENDENCY`).
pub const REMOVE: &str = "-";
/// `+`: take the version from the workspace (`MANUALLY_ADD_DEPENDENCY`).
pub const ADD: &str = "+";

/// Index of a lifecycle in [`FieldMaps`].
#[must_use]
#[inline]
pub const fn field_index(lifecycle: Lifecycle) -> usize {
    match lifecycle {
        Lifecycle::Runtime => 0,
        Lifecycle::Dev => 1,
        Lifecycle::Peer => 2,
    }
}

/// Non-forced entries: rules applied to auto-detected dependencies only.
#[must_use]
#[inline]
pub fn auto_detect(policy: &[PolicyEntry]) -> FieldMaps {
    let mut result = FieldMaps::default();
    for entry in policy.iter().filter(|entry| !entry.force) {
        let name = entry.name.trim();
        let version = entry.version.trim();
        if !name.is_empty() && !version.is_empty() {
            let map = &mut result[field_index(entry.lifecycle)];
            if !map.contains_key(name) {
                map.insert(name.to_owned(), version.to_owned());
            }
        }
    }
    result
}

/// Forced entries: dependencies added manually. A name is taken once across
/// fields unless the value is `-`.
#[must_use]
#[inline]
pub fn deps(policy: &[PolicyEntry]) -> FieldMaps {
    let mut result = FieldMaps::default();
    let mut used = std::collections::HashSet::new();
    for entry in policy.iter().filter(|entry| entry.force) {
        let (name, version) = (entry.name.trim(), entry.version.trim());
        if name.is_empty() || version.is_empty() || (used.contains(name) && version != REMOVE) {
            continue;
        }
        let map = &mut result[field_index(entry.lifecycle)];
        if !map.contains_key(name) {
            if version != REMOVE {
                used.insert(name);
            }
            map.insert(name.to_owned(), version.to_owned());
        }
    }
    result
}

/// `ComponentOverrides.getIgnoredPackages(field)`: names set to `-`.
#[must_use]
#[inline]
pub fn ignored(overrides: &FieldMaps, lifecycle: Lifecycle) -> Vec<String> {
    overrides[field_index(lifecycle)]
        .iter()
        .filter_map(|(name, version)| {
            let name = name.trim();
            (version.trim() == REMOVE && !name.is_empty()).then(|| name.to_owned())
        })
        .collect()
}
