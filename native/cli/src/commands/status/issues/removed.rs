//! Dependencies on components removed in this workspace.
//!
//! Extends [`Checks`] with [`Checks::removed_dependencies`] to emit [`Issue`] entries for [`Component`] and [`Value`] targets.

use super::{Checks, Component, Issue, array, without_version};
use serde_json::Value;
use std::{collections::HashSet, io};

impl Checks<'_> {
    /// Returns dependency IDs of `component` that point to locally removed workspace components.
    #[inline]
    pub(super) fn removed_dependencies(
        &self,
        component: &Component,
        issues: &[(Issue, Value)],
    ) -> io::Result<Vec<String>> {
        let missing = issues
            .iter()
            .find(|(kind, _)| *kind == Issue::MissingPackages)
            .map(|(_, data)| array(Some(data), "missing packages"))
            .transpose()?
            .unwrap_or_default();
        let packages = missing_packages(missing);
        Ok(self.targets
            .iter()
            .filter(|target| target["locallyRemoved"] == true)
            .filter_map(|target| removed_id(target, component, &packages))
            .collect())
    }
}

#[inline]
fn missing_packages(rows: &[Value]) -> HashSet<&str> {
    rows.iter()
        .flat_map(|row| {
            row.get("missingPackages")
                .or_else(|| row.get("packages"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|pkg| !pkg.is_empty())
        .collect()
}

fn removed_id(target: &Value, component: &Component, packages: &HashSet<&str>) -> Option<String> {
    let raw = target["identity"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .or_else(|| {
            target["id"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
        })?;
    let identity = without_version(raw);
    let version = target["version"]
        .as_str()
        .or_else(|| target["head"].as_str())
        .map(str::trim)
        .filter(|ver| !ver.is_empty())?;
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())?;
    let referenced = component.dependencies
        .iter()
        .any(|dependency| without_version(dependency) == identity)
        || (!packages.is_empty()
            && packages.contains(format!("@{scope}/{}", name.replace('/', ".")).as_str()));
    referenced.then(|| format!("{scope}/{name}@{version}"))
}
