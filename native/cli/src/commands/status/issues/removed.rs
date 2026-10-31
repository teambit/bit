//! Dependencies on components removed in this workspace.

use super::{Checks, Component, Issue, array, without_version};
use serde_json::Value;
use std::{collections::HashSet, io};

impl Checks<'_> {
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

fn missing_packages(rows: &[Value]) -> HashSet<&str> {
    rows.iter()
        .flat_map(|row| {
            row["missingPackages"]
                .as_array()
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
        .or_else(|| target["id"].as_str())?;
    let identity = without_version(raw);
    let version = target["version"]
        .as_str()
        .or_else(|| target["head"].as_str())?;
    let (scope, name) = identity.split_once('/')?;
    let package = format!("@{scope}/{}", name.replace('/', "."));
    let referenced = component.dependencies
        .iter()
        .any(|dependency| without_version(dependency) == identity)
        || packages.contains(package.as_str());
    referenced.then(|| format!("{identity}@{version}"))
}
