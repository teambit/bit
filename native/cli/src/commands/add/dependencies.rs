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
        .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base))
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
        for (name, spec) in packages {
            let version = spec
                .as_str()
                .or_else(|| spec["version"].as_str())
                .ok_or_else(|| io::Error::other("tracking package version"))?;
            let optional = spec["optional"].as_bool().unwrap_or(false);
            result.packages.push(PackageDependency {
                name: name.clone(),
                version: version.to_owned(),
                lifecycle,
                optional,
            });
        }
    }
    Ok((identity.to_owned(), result))
}
