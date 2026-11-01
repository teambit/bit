//! The component's `Version` object in the scope (`componentFromModel`).

use super::data::{LegacyDependency, legacy_dependencies, string_map};
use crate::policy::{DEPENDENCY_RESOLVER, overrides::FieldMaps};
use indexmap::IndexMap;
use serde_json::Value;

/// The stored `Version` of a workspace component, when it has one.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct ComponentModel {
    version: Option<Value>,
}

impl ComponentModel {
    #[inline]
    #[must_use]
    pub const fn new(version: Option<Value>) -> Self {
        Self { version }
    }

    #[inline]
    #[must_use]
    pub const fn exists(&self) -> bool {
        self.version.is_some()
    }

    /// `packageDependencies`, `devPackageDependencies`, `peerPackageDependencies`.
    #[inline]
    #[must_use]
    pub fn packages(&self) -> FieldMaps {
        let Some(version) = &self.version else { return FieldMaps::default() };
        ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"].map(|field| {
            string_map(&version[field])
        })
    }

    /// `getAllPackageDependencies()`: runtime then dev packages.
    #[inline]
    #[must_use]
    pub fn all_packages(&self) -> IndexMap<String, String> {
        let Some(version) = &self.version else { return IndexMap::new() };
        let mut all = string_map(&version["packageDependencies"]);
        all.extend(string_map(&version["devPackageDependencies"]));
        all
    }

    /// `dependencies`, `devDependencies` and `peerDependencies` component dependencies.
    #[must_use]
    pub fn components(&self) -> Vec<LegacyDependency> {
        let Some(version) = &self.version else { return Vec::new() };
        ["dependencies", "devDependencies", "peerDependencies"]
            .iter()
            .flat_map(|field| legacy_dependencies(&version[field]))
            .collect()
    }

    /// The serialized `dependency-resolver` dependency list stored with the version.
    #[must_use]
    pub fn serialized_dependencies(&self) -> Vec<Value> {
        let Some(version) = &self.version else { return Vec::new() };
        version["extensions"]
            .as_array()
            .and_then(|extensions| {
                extensions.iter().find(|extension| is_dependency_resolver_extension(extension))
            })
            .and_then(|extension| extension["data"]["dependencies"].as_array())
            .cloned()
            .unwrap_or_default()
    }

    /// The raw `Version` object.
    #[inline]
    #[must_use]
    pub const fn raw(&self) -> Option<&Value> {
        self.version.as_ref()
    }
}

#[inline]
fn is_dependency_resolver_extension(extension: &Value) -> bool {
    crate::workspace::extension_name(extension)
        .as_deref()
        .is_some_and(|name| {
            matches!(
                crate::policy::split_version(name).0.trim().trim_matches('/'),
                DEPENDENCY_RESOLVER | "@teambit/dependencies.dependency-resolver",
            )
        })
}
