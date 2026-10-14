//! The legacy component's dependency data (`DependenciesData`): what detection
//! produces, what Bit's dependency cache stores, and what overrides transform.

use crate::{model::ComponentId, policy::overrides::FieldMaps};
use indexmap::IndexMap;
use serde_json::Value;

/// A legacy component dependency (`Dependency` of `@teambit/legacy.consumer-component`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyDependency {
    pub id: ComponentId,
    pub package_name: Option<String>,
    pub version_range: Option<String>,
}

/// One `MissingPackagesDependenciesOnFs` issue entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingFile {
    pub file: String,
    pub packages: Vec<String>,
    pub is_dev: bool,
}

/// `allDependencies`, `allPackagesDependencies`, the missing-packages issue and
/// `coreAspects`, each field array indexed by `overrides::field_index`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Detected {
    pub components: [Vec<LegacyDependency>; 3],
    pub packages: FieldMaps,
    pub missing: Vec<MissingFile>,
    pub core_aspects: Vec<String>,
}

const COMPONENT_FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];
const PACKAGE_FIELDS: [&str; 3] =
    ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"];

impl Detected {
    /// `DependenciesData.deserialize` of a dependency cache entry.
    #[must_use]
    pub fn from_cache(data: &Value) -> Self {
        let mut detected = Self::default();
        for (index, field) in COMPONENT_FIELDS.iter().enumerate() {
            detected.components[index] = legacy_dependencies(&data["allDependencies"][field]);
            detected.packages[index] =
                string_map(&data["allPackagesDependencies"][PACKAGE_FIELDS[index]]);
        }
        detected.missing = missing_from_issues(&data["issues"]);
        detected.core_aspects = data["coreAspects"]
            .as_array()
            .map(|aspects| {
                aspects
                    .iter()
                    .filter_map(|aspect| aspect.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default();
        detected
    }

    /// All missing package names, in issue order and without duplicates.
    #[must_use]
    pub fn missing_packages(&self) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        for name in self.missing.iter().flat_map(|file| &file.packages) {
            if !names.contains(name) {
                names.push(name.clone());
            }
        }
        names
    }
}

/// Serialized `Dependency[]`: `{ id: { scope, name, version }, packageName, versionRange }`.
#[must_use]
pub fn legacy_dependencies(value: &Value) -> Vec<LegacyDependency> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(legacy_dependency)
                .collect()
        })
        .unwrap_or_default()
}

fn legacy_dependency(value: &Value) -> Option<LegacyDependency> {
    Some(LegacyDependency {
        id: id_from_object(&value["id"])?,
        package_name: value["packageName"].as_str().map(str::to_owned),
        version_range: value["versionRange"].as_str().map(str::to_owned),
    })
}

/// `ComponentID.fromObject({ scope, name, version })`.
#[must_use]
pub fn id_from_object(value: &Value) -> Option<ComponentId> {
    let non_empty = |key: &str| {
        value[key]
            .as_str()
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
    };
    Some(ComponentId {
        scope: non_empty("scope"),
        default_scope: None,
        name: non_empty("name")?,
        version: non_empty("version"),
    })
}

/// A `{ name: version }` JSON object as a string map.
#[must_use]
pub fn string_map(value: &Value) -> IndexMap<String, String> {
    value
        .as_object()
        .map(|object| {
            object
                .iter()
                .filter_map(|(name, version)| Some((name.clone(), version.as_str()?.to_owned())))
                .collect()
        })
        .unwrap_or_default()
}

/// The `MissingPackagesDependenciesOnFs` entries of a serialized `IssuesList`
/// (`[{ type, data: "<json>" }]`).
fn missing_from_issues(issues: &Value) -> Vec<MissingFile> {
    let Some(issue) = issues
        .as_array()
        .and_then(|issues| {
            issues
                .iter()
                .find(|issue| issue["type"] == "MissingPackagesDependenciesOnFs")
        })
    else {
        return Vec::new();
    };
    let data = match &issue["data"] {
        Value::String(text) => serde_json::from_str(text).unwrap_or(Value::Null),
        other => other.clone(),
    };
    data.as_array()
        .map(|entries| {
            entries
                .iter()
                .map(|entry| MissingFile {
                    file: entry["filePath"]
                        .as_str()
                        .unwrap_or_default()
                        .to_owned(),
                    packages: string_list(&entry["missingPackages"]),
                    is_dev: entry["isDevFile"].as_bool().unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn string_list(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}
