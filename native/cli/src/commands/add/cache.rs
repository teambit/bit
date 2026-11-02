//! Link issues block dependency-cache saves; new [`WorkspaceComponent`] package manifests invalidate loader entries.
//!
//! Provides [`restrict`] and [`invalidate`] helpers for `bit add` and identity mutations.
use crate::commands::status::capture::Capture;
use bit_install::model::WorkspaceComponent;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

/// Blocks dependency-cache writes for newly captured [`WorkspaceComponent`]s whose `node_modules` links are absent.
pub(in crate::commands) fn restrict(root: &Path, capture: &mut Capture) {
    let captured_ids: HashSet<&str> = capture.captured
        .iter()
        .filter(|row| row["directory"].as_str().map(str::trim) != Some("."))
        .filter_map(|row| row["identity"].as_str().map(identity))
        .collect();
    let node_modules = root.join("node_modules");
    let identities = capture.components
        .iter()
        .filter(|component| {
            let package_name = component.package_name.trim();
            captured_ids.contains(identity(&component.identity))
                && (package_name.is_empty() || !node_modules.join(package_name).exists())
        })
        .map(|component| identity(&component.identity).to_owned())
        .collect::<HashSet<_>>();
    capture.cache.block_dependencies(&identities);
}

#[inline]
fn identity(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed.split_once('@').map_or(trimmed, |(identity, _)| identity.trim())
}

/// Observed `node_modules` `package.json` preimages for tracked [`WorkspaceComponent`]s.
pub(super) struct Manifests(Vec<(PathBuf, Option<String>)>);
impl Manifests {
    pub(super) fn observe(root: &Path, components: &[WorkspaceComponent]) -> Self {
        Self(
            components
                .iter()
                .filter(|component| {
                    let root_dir = component.root_dir.trim();
                    let package_name = component.package_name.trim();
                    !root_dir.is_empty()
                        && root_dir != "."
                        && !package_name.is_empty()
                        && !component.files
                            .iter()
                            .any(|file| file.trim() == "package.json")
                })
                .map(|component| {
                    let path = root
                        .join("node_modules")
                        .join(component.package_name.trim())
                        .join("package.json");
                    let before = serialized(&path);
                    (path, before)
                })
                .collect(),
        )
    }
    #[inline]
    pub(super) fn changed(&self) -> bool {
        self.0
            .iter()
            .any(|(path, before)| before.is_none() || serialized(path).as_ref() != before.as_ref())
    }
}
#[inline]
fn serialized(path: &Path) -> Option<String> {
    if fs::metadata(path).ok()?.len() > 4 * 1024 * 1024 {
        return None;
    }
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
