//! `DependenciesData.serialize()`: the JSON Bit stores in its dependency cache.

use super::super::data::{Detected, LegacyDependency};
use serde_json::{Map, Value, json};

const COMPONENT_FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];
const PACKAGE_FIELDS: [&str; 3] =
    ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"];

/// The serialized data, with the keys in the order `DependenciesData.serialize` writes.
#[must_use]
pub fn serialize(detected: &Detected) -> Value {
    let mut packages = Map::new();
    for (index, field) in PACKAGE_FIELDS.iter().enumerate() {
        let entries: Map<String, Value> = detected.packages[index]
            .iter()
            .map(|(name, version)| (name.clone(), Value::String(version.clone())))
            .collect();
        packages.insert((*field).to_owned(), Value::Object(entries));
    }
    let mut components = Map::new();
    for (index, field) in COMPONENT_FIELDS.iter().enumerate() {
        let entries: Vec<Value> = detected.components[index]
            .iter()
            .map(dependency)
            .collect();
        components.insert((*field).to_owned(), Value::Array(entries));
    }
    json!({
        "allPackagesDependencies": packages,
        "coreAspects": detected.core_aspects,
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
fn dependency(dependency: &LegacyDependency) -> Value {
    let mut id = Map::new();
    if let Some(scope) = &dependency.id.scope {
        id.insert("scope".to_owned(), Value::String(scope.clone()));
    }
    id.insert("name".to_owned(), Value::String(dependency.id.name.clone()));
    if let Some(version) = &dependency.id.version {
        id.insert("version".to_owned(), Value::String(version.clone()));
    }
    let mut value = Map::new();
    value.insert("id".to_owned(), Value::Object(id));
    value.insert("relativePaths".to_owned(), Value::Array(Vec::new()));
    if let Some(name) = &dependency.package_name {
        value.insert("packageName".to_owned(), Value::String(name.clone()));
    }
    if let Some(range) = &dependency.version_range {
        value.insert("versionRange".to_owned(), Value::String(range.clone()));
    }
    Value::Object(value)
}

/// `IssuesList.serialize()`: `[{ type, data: "<json>" }]`.
fn issues(detected: &Detected) -> Vec<Value> {
    let mut issues = Vec::new();
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

fn issue(kind: &str, data: &Value) -> Value {
    json!({ "type": kind, "data": data.to_string() })
}
