//! Package dependencies from the shared native component-load receipt.
use bit_install::model::{ComponentDependencies, Lifecycle, PackageDependency};
use serde_json::Value;
use std::io;

pub(super) fn packages(captured: &[Value]) -> io::Result<Vec<(String, ComponentDependencies)>> {
    captured
        .iter()
        .map(component_packages)
        .collect()
}
fn component_packages(row: &Value) -> io::Result<(String, ComponentDependencies)> {
    let identity =
        row["identity"].as_str().ok_or_else(|| io::Error::other("tracking dependency identity"))?;
    let mut result = ComponentDependencies::default();
    for (key, lifecycle) in [
        ("packageDependencies", Lifecycle::Runtime),
        ("devPackageDependencies", Lifecycle::Dev),
        ("peerPackageDependencies", Lifecycle::Peer),
    ] {
        let packages = row["current"][key]
            .as_object()
            .ok_or_else(|| io::Error::other("tracking package dependencies"))?;
        for (name, version) in packages {
            result.packages.push(PackageDependency {
                name: name.clone(),
                version: version
                    .as_str()
                    .ok_or_else(|| io::Error::other("tracking package version"))?
                    .to_owned(),
                lifecycle,
                optional: false,
            });
        }
    }
    Ok((identity.to_owned(), result))
}
