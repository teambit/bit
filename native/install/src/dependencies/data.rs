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

/// One file of an `UntrackedDependencies` issue entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UntrackedFile {
    /// Relative to the workspace root.
    pub relative_path: String,
    /// Another file of the component imports it too.
    pub existing: bool,
}

/// One `UntrackedDependencies` issue entry: the untracked files one file imports.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Untracked {
    pub nested: bool,
    pub files: Vec<UntrackedFile>,
}

/// `allDependencies`, `allPackagesDependencies`, the detection issues and
/// `coreAspects`, each field array indexed by `overrides::field_index`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Detected {
    pub components: [Vec<LegacyDependency>; 3],
    pub packages: FieldMaps,
    /// `MissingPackagesDependenciesOnFs`.
    pub missing: Vec<MissingFile>,
    /// `MissingDependenciesOnFs`: importing file → the relative specifiers that
    /// name no file.
    pub missing_files: IndexMap<String, Vec<String>>,
    /// `UntrackedDependencies`: importing file → files no component tracks.
    pub untracked: IndexMap<String, Untracked>,
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
        let issues = &data["issues"];
        detected.missing = missing_from_issues(issues);
        detected.missing_files = missing_files_from_issues(issues);
        detected.untracked = untracked_from_issues(issues);
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

    /// Whether Bit would not cache this data (`shouldBlockSavingInCache`): every
    /// detection issue is a cache blocker.
    #[must_use]
    pub fn blocks_cache(&self) -> bool {
        !self.missing.is_empty()
            || !self.missing_files.is_empty()
            || !self.untracked.is_empty()
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
        id: id_from_object(value)?,
        package_name: value["packageName"].as_str().map(str::to_owned),
        version_range: value["versionRange"].as_str().map(str::to_owned),
    })
}

/// `ComponentID.fromObject({ scope, name, version })` or string id.
#[must_use]
pub fn id_from_object(value: &Value) -> Option<ComponentId> {
    if let Some(raw) = value
        .as_str()
        .or_else(|| value["id"].as_str())
    {
        return id_from_str(raw);
    }
    let inner = value
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(value);
    let raw_name = inner["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .filter(|text| !text.is_empty())?;
    let (name, inline_ver) = crate::policy::split_version(raw_name);
    let version = inner["version"]
        .as_str()
        .or_else(|| value["version"].as_str())
        .or_else(|| inner["head"].as_str())
        .or_else(|| value["head"].as_str())
        .filter(|text| !text.is_empty())
        .or(inline_ver)
        .filter(|ver| *ver != "latest")
        .map(str::to_owned);
    Some(ComponentId {
        scope: inner["scope"]
            .as_str()
            .or_else(|| value["scope"].as_str())
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        default_scope: None,
        name: name.to_owned(),
        version,
    })
}

fn id_from_str(raw: &str) -> Option<ComponentId> {
    let (bare, version) = crate::policy::split_version(raw);
    let (scope, name) = bare
        .split_once('/')
        .map_or((None, bare), |(sc, nm)| ((!sc.is_empty()).then_some(sc), nm));
    (!name.is_empty()).then(|| ComponentId {
        scope: scope.map(str::to_owned),
        default_scope: None,
        name: name.to_owned(),
        version: version
            .filter(|ver| !ver.is_empty() && *ver != "latest")
            .map(str::to_owned),
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

/// The deserialized `data` of one issue of a serialized `IssuesList`
/// (`[{ type, data: "<json>" }]`).
fn issue_data(issues: &Value, kind: &str) -> Value {
    let Some(issue) = issues
        .as_array()
        .and_then(|issues| {
            issues
                .iter()
                .find(|issue| issue["type"] == kind)
        })
    else {
        return Value::Null;
    };
    match &issue["data"] {
        Value::String(text) => serde_json::from_str(text).unwrap_or(Value::Null),
        other => other.clone(),
    }
}

/// The `MissingPackagesDependenciesOnFs` entries of a serialized `IssuesList`.
fn missing_from_issues(issues: &Value) -> Vec<MissingFile> {
    issue_data(issues, "MissingPackagesDependenciesOnFs")
        .as_array()
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

/// The `MissingDependenciesOnFs` entries: `{ file: [specifier] }`.
fn missing_files_from_issues(issues: &Value) -> IndexMap<String, Vec<String>> {
    issue_data(issues, "MissingDependenciesOnFs")
        .as_object()
        .map(|entries| {
            entries
                .iter()
                .map(|(file, specifiers)| (file.clone(), string_list(specifiers)))
                .collect()
        })
        .unwrap_or_default()
}

/// The `UntrackedDependencies` entries: `{ file: { nested, untrackedFiles } }`.
fn untracked_from_issues(issues: &Value) -> IndexMap<String, Untracked> {
    issue_data(issues, "UntrackedDependencies")
        .as_object()
        .map(|entries| {
            entries
                .iter()
                .map(|(file, entry)| (file.clone(), untracked_entry(entry)))
                .collect()
        })
        .unwrap_or_default()
}

fn untracked_entry(entry: &Value) -> Untracked {
    let files = entry["untrackedFiles"]
        .as_array()
        .map(|files| {
            files
                .iter()
                .map(|file| UntrackedFile {
                    relative_path: file["relativePath"]
                        .as_str()
                        .unwrap_or_default()
                        .to_owned(),
                    existing: file["existing"].as_bool().unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();
    Untracked { nested: entry["nested"].as_bool().unwrap_or(false), files }
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
