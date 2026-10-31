//! Link issues block dependency-cache saves; new package manifests invalidate loader entries.
use crate::commands::status::capture::Capture;
use bit_install::model::WorkspaceComponent;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub(in crate::commands) fn restrict(root: &Path, capture: &mut Capture) {
    let identities = capture.components
        .iter()
        .filter(|component| {
            capture.captured
                .iter()
                .any(|row| {
                    row["identity"] == identity(&component.identity) && row["directory"] != "."
                })
                && !root
                    .join("node_modules")
                    .join(&component.package_name)
                    .exists()
        })
        .map(|component| identity(&component.identity).to_owned())
        .collect::<HashSet<_>>();
    capture.cache.block_dependencies(&identities);
}

fn identity(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed.split_once('@').map_or(trimmed, |(identity, _)| identity.trim())
}

pub(super) struct Manifests(Vec<(PathBuf, Option<String>)>);
impl Manifests {
    pub(super) fn observe(root: &Path, components: &[WorkspaceComponent]) -> Self {
        Self(
            components
                .iter()
                .filter(|component| {
                    component.root_dir != "."
                        && !component.files
                            .iter()
                            .any(|file| file == "package.json")
                })
                .map(|component| {
                    let path = root
                        .join("node_modules")
                        .join(&component.package_name)
                        .join("package.json");
                    let before = serialized(&path);
                    (path, before)
                })
                .collect(),
        )
    }
    pub(super) fn changed(&self) -> bool {
        self.0
            .iter()
            .any(|(path, before)| before.is_none() || serialized(path).as_ref() != before.as_ref())
    }
}
fn serialized(path: &Path) -> Option<String> {
    let value: serde_json::Value = bit_object_import::parse_jsonc(&fs::read(path).ok()?).ok()?;
    bit_object_import::stringify_json(&value, false).ok()
}

pub(in crate::commands) fn invalidate(
    root: &Path,
    components: &[WorkspaceComponent],
) -> io::Result<()> {
    let cache = bit_object_import::scope_path(root).join("cache/components/deps");
    for component in components
        .iter()
        .filter(|component| component.root_dir != ".")
    {
        let id = component.id.to_string_without_version();
        let key = match component.id.version
            .as_deref()
            .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
        {
            Some(version) => format!("{id}@{version}"),
            None => id,
        };
        bit_install::dependencies::cache::remove_entry(&cache, &key)?;
    }
    Ok(())
}
