//! Pin a deleted lane dependency through the shared Rust [`Document`] workspace policy editor ([`edit_workspace_config`]).
//!
//! Defines [`Policy`] to stage and commit `workspace.jsonc` dependency pins for [`Pin`]s.

use crate::commands::workspace_command::format::Formatter;
use bit_install::{
    command::{add_root_policy_entries, edit_workspace_config},
    jsonc::Document,
    options::ExistingEntries,
};
use bit_object_import::component_delete::Pin;
use node_semver::{Range, Version};
use serde_json::Value;
use std::{fs, io, path::Path};

/// Aspect identifier key for `@teambit/dependency-resolver` in `workspace.jsonc`.
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
/// History reason recorded when `bit delete` pins lane-deleted dependencies in `workspace.jsonc`.
const REASON: &str = "delete (pin deleted-on-lane deps to main)";

/// Staged `workspace.jsonc` [`Document`] edit that pins lane-deleted dependencies to their `main` version.
pub(super) struct Policy {
    before: Vec<u8>,
    document: Document,
    items: Vec<String>,
}
impl Policy {
    /// Prepares a [`Policy`] edit for all non-empty `pins` ([`Pin`]) via [`range`], or returns `Ok(None)` when `pins` is empty.
    pub(super) fn prepare_many(root: &Path, pins: &[&Pin]) -> io::Result<Option<Self>> {
        if pins.is_empty() {
            return Ok(None);
        }
        let before = fs::read(root.join("workspace.jsonc"))?;
        let mut document =
            Document::parse(std::str::from_utf8(&before).map_err(io::Error::other)?)?;
        let mut items = Vec::with_capacity(pins.len());
        for pin in pins {
            let package_name = pin.package_name.trim();
            if package_name.is_empty() {
                return Err(io::Error::other("empty deleted component package name"));
            }
            let version = range(&document, pin.version.trim())?;
            add_root_policy_entries(
                &mut document,
                &[(package_name.to_owned(), version.clone())],
                ExistingEntries::Skip,
            )?;
            let item = format!("{package_name}@{version}");
            if !items.contains(&item) {
                items.push(item);
            }
        }
        Ok(Some(Self { before, document, items }))
    }
    /// Verifies that `workspace.jsonc` is still a regular non-symlink file matching `self.before`.
    #[inline]
    pub(super) fn validate(&self, root: &Path) -> io::Result<()> {
        let path = root.join("workspace.jsonc");
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || fs::read(path)? != self.before
        {
            return Err(io::Error::other("workspace policy changed before deletion"));
        }
        Ok(())
    }
    /// Commits the staged `workspace.jsonc` dependency policy edit via [`edit_workspace_config`].
    #[inline]
    pub(super) fn commit(&self, root: &Path, file_id: &str) -> io::Result<()> {
        edit_workspace_config(
            root,
            &bit_workspace_config::scope_path(root),
            file_id,
            REASON,
            |document| {
                *document = self.document.clone();
            },
        )
    }
    /// Renders the summary section listing dependencies pinned to their `main` version.
    #[inline]
    pub(super) fn report(&self, format: &Formatter) -> String {
        format.section("pinned deleted components to their main version", "these components were deleted from the lane but still have dependents in the workspace, so they were added to the workspace policy to be installed from main", &self.items.iter().map(|item| format.item(item)).collect::<Vec<_>>())
    }
}
#[inline]
fn range(document: &Document, tag: &str) -> io::Result<String> {
    let tag = tag.trim();
    if tag.len() == 40 && tag.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Ok(tag.to_owned());
    }
    let version = Version::parse(tag).map_err(io::Error::other)?;
    if version.is_prerelease() {
        return Ok(tag.to_owned());
    }
    let prefix = resolve_save_prefix(document)?;
    let range = format!("{prefix}{tag}");
    Range::parse(&range).map_err(io::Error::other)?;
    Ok(range)
}

#[inline]
fn resolve_save_prefix(document: &Document) -> io::Result<String> {
    let prefix = document
        .get(&[RESOLVER, "savePrefix"])
        .or_else(|| {
            crate::commands::update_cmd::aspect_entry(&document.value(), RESOLVER)
                .and_then(|(_, resolver)| resolver.get("savePrefix").cloned())
        });
    match prefix {
        None | Some(Value::Null) => Ok("^".to_owned()),
        Some(Value::String(prefix)) if prefix.trim().is_empty() => Ok("^".to_owned()),
        Some(Value::String(prefix)) => Ok(prefix.trim().to_owned()),
        _ => Err(io::Error::other("unsupported save prefix")),
    }
}
