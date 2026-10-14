//! The legacy overrides views of a merged component policy
//! (`toLegacyAutoDetectOverrides`, `toLegacyDepsOverrides`).

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
pub const fn field_index(lifecycle: Lifecycle) -> usize {
    match lifecycle {
        Lifecycle::Runtime => 0,
        Lifecycle::Dev => 1,
        Lifecycle::Peer => 2,
    }
}

/// Non-forced entries: rules applied to auto-detected dependencies only.
#[must_use]
pub fn auto_detect(policy: &[PolicyEntry]) -> FieldMaps {
    let mut result = FieldMaps::default();
    for entry in policy.iter().filter(|entry| !entry.force) {
        result[field_index(entry.lifecycle)].insert(entry.name.clone(), entry.version.clone());
    }
    result
}

/// Forced entries: dependencies added manually. A name is taken once across
/// fields unless the value is `-`.
#[must_use]
pub fn deps(policy: &[PolicyEntry]) -> FieldMaps {
    let mut result = FieldMaps::default();
    let mut used: Vec<&str> = Vec::new();
    for entry in policy.iter().filter(|entry| entry.force) {
        if used.contains(&entry.name.as_str()) && entry.version != REMOVE {
            continue;
        }
        result[field_index(entry.lifecycle)].insert(entry.name.clone(), entry.version.clone());
        if entry.version != REMOVE {
            used.push(&entry.name);
        }
    }
    result
}

/// `ComponentOverrides.getIgnoredPackages(field)`: names set to `-`.
#[must_use]
pub fn ignored(overrides: &FieldMaps, lifecycle: Lifecycle) -> Vec<String> {
    overrides[field_index(lifecycle)]
        .iter()
        .filter(|(_, version)| version.as_str() == REMOVE)
        .map(|(name, _)| name.clone())
        .collect()
}
