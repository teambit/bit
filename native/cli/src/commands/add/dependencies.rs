//! Package dependencies from the shared native component-load receipt.
use bit_install::model::{ComponentDependencies, Lifecycle, PackageDependency};
use serde_json::Value;
use std::io;

pub(in crate::commands) fn packages(
    captured: &[Value],
) -> io::Result<Vec<(String, ComponentDependencies)>> {
    captured
        .iter()
        .map(component_packages)
        .collect()
}
fn component_packages(row: &Value) -> io::Result<(String, ComponentDependencies)> {
    let identity = row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
        .filter(|id| !id.is_empty())
        .ok_or_else(|| io::Error::other("tracking dependency identity"))?;
    let mut result = ComponentDependencies::default();
    for (key, lifecycle) in [
        ("packageDependencies", Lifecycle::Runtime),
        ("devPackageDependencies", Lifecycle::Dev),
        ("peerPackageDependencies", Lifecycle::Peer),
    ] {
        let Some(packages) = row["current"]
            .get(key)
            .filter(|val| !val.is_null())
        else {
            continue;
        };
        let packages = packages
            .as_object()
            .ok_or_else(|| io::Error::other("tracking package dependencies"))?;
        add_lifecycle_packages(packages, lifecycle, &mut result)?;
    }
    Ok((identity.to_owned(), result))
}

fn add_lifecycle_packages(
    packages: &serde_json::Map<String, Value>,
    lifecycle: Lifecycle,
    result: &mut ComponentDependencies,
) -> io::Result<()> {
    for (name, spec) in packages {
        let name = name.trim();
        let version = spec
            .as_str()
            .or_else(|| spec["version"].as_str())
            .map(str::trim)
            .filter(|ver| !ver.is_empty() && !name.is_empty())
            .ok_or_else(|| io::Error::other("tracking package version"))?;
        let optional = spec["optional"].as_bool().unwrap_or(false);
        result.packages.push(PackageDependency {
            name: name.to_owned(),
            version: version.to_owned(),
            lifecycle,
            optional,
        });
    }
    Ok(())
}
