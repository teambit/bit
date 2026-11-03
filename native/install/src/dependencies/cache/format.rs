//! `DependenciesData.serialize()`: the JSON Bit stores in its component dependency cache.
//!
//! [`serialize`] formats [`Detected`] package maps ([`PACKAGE_FIELDS`]), [`COMPONENT_FIELDS`], issues, and core aspects in canonical key order.

use super::super::data::{Detected, LegacyDependency};
use serde_json::{Map, Value, json};

/// Component dependency lifecycle keys (`dependencies`, `devDependencies`, `peerDependencies`) serialized by [`serialize`].
const COMPONENT_FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];
/// Package dependency lifecycle keys (`packageDependencies`, `devPackageDependencies`, `peerPackageDependencies`).
const PACKAGE_FIELDS: [&str; 3] =
    ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"];

/// The serialized data, with the keys in the order `DependenciesData.serialize` writes.
#[must_use]
pub fn serialize(detected: &Detected) -> Value {
    let packages: Map<String, Value> = PACKAGE_FIELDS
        .iter()
        .zip(&detected.packages)
        .map(|(field, map)| {
            let entries: Map<String, Value> = map
                .iter()
                .filter_map(|(name, version)| {
                    let name = name.trim();
                    (!name.is_empty()).then(|| {
                        (name.to_owned(), Value::String(version.trim().to_owned()))
                    })
                })
                .collect();
            ((*field).to_owned(), Value::Object(entries))
        })
        .collect();
    let components: Map<String, Value> = COMPONENT_FIELDS
        .iter()
        .zip(&detected.components)
        .map(|(field, list)| {
            let entries: Vec<Value> = list.iter().map(dependency).collect();
            ((*field).to_owned(), Value::Array(entries))
        })
        .collect();
    let core_aspects: Vec<&str> = detected.core_aspects
        .iter()
        .map(|aspect| aspect.trim())
        .filter(|aspect| !aspect.is_empty())
        .collect();
    json!({
        "allPackagesDependencies": packages,
        "coreAspects": core_aspects,
        "issues": issues(detected),
        "allDependencies": components,
        // for backward compatibility. version < 1.5.1 expected this to be saved in the fs cache.
        "overridesDependencies": {
            "manuallyRemovedDependencies": {},
            "manuallyAddedDependencies": {},
            "missingPackageDependencies": [],
        },
    })
}

/// `Dependency.serialize()`. The relative paths of a relative cross-component import
/// are not tracked natively; the cache reader ignores them.
#[inline]
fn dependency(dependency: &LegacyDependency) -> Value {
    let mut value = Map::with_capacity(4);
    value.insert("id".to_owned(), dependency_id(dependency));
    value.insert("relativePaths".to_owned(), Value::Array(Vec::new()));
    if let Some(name) = dependency.package_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        value.insert("packageName".to_owned(), Value::String(name.to_owned()));
    }
    if let Some(range) = dependency.version_range
        .as_deref()
        .map(str::trim)
        .filter(|range| !range.is_empty())
    {
        value.insert("versionRange".to_owned(), Value::String(range.to_owned()));
    }
    Value::Object(value)
}

/// Serialize [`LegacyDependency`] `dependency.id` into the `{ scope?, name, version? }` JSON [`Value`] object stored in the dependency cache.
#[inline]
fn dependency_id(dependency: &LegacyDependency) -> Value {
    let mut id = Map::with_capacity(3);
    if let Some(scope) = dependency.id.scope
        .as_deref()
        .map(str::trim)
        .filter(|sc| !sc.is_empty())
    {
        id.insert("scope".to_owned(), Value::String(scope.to_owned()));
    }
    id.insert("name".to_owned(), Value::String(dependency.id.name.trim().to_owned()));
    if let Some(version) = dependency.id.version
        .as_deref()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
    {
        id.insert("version".to_owned(), Value::String(version.to_owned()));
    }
    if !id.contains_key("scope")
        && let Some(scope) = dependency.id.default_scope
            .as_deref()
            .map(str::trim)
            .filter(|sc| !sc.is_empty())
    {
        id.insert("scope".to_owned(), Value::String(scope.to_owned()));
    }
    Value::Object(id)
}

/// `IssuesList.serialize()`: `[{ type, data: "<json>" }]`.
fn issues(detected: &Detected) -> Vec<Value> {
    let mut issues = Vec::with_capacity(3);
    if !detected.missing_files.is_empty() {
        issues.push(issue("MissingDependenciesOnFs", &json!(detected.missing_files)));
    }
    if !detected.missing.is_empty() {
        let entries: Vec<Value> = detected.missing
            .iter()
            .map(|entry| {
                json!({
                    "filePath": entry.file,
                    "missingPackages": entry.packages,
                    "isDevFile": entry.is_dev,
                })
            })
            .collect();
        issues.push(issue("MissingPackagesDependenciesOnFs", &Value::Array(entries)));
    }
    if !detected.untracked.is_empty() {
        let entries: Map<String, Value> = detected.untracked
            .iter()
            .map(|(file, entry)| {
                let files: Vec<Value> = entry.files
                    .iter()
                    .map(|found| {
                        json!({ "relativePath": found.relative_path, "existing": found.existing })
                    })
                    .collect();
                (file.clone(), json!({ "nested": entry.nested, "untrackedFiles": files }))
            })
            .collect();
        issues.push(issue("UntrackedDependencies", &Value::Object(entries)));
    }
    issues
}

/// Formats a single serialized issue entry (`{ type: kind, data: "<json>" }`).
#[inline]
fn issue(kind: &str, data: &Value) -> Value {
    json!({ "type": kind, "data": data.to_string() })
}
