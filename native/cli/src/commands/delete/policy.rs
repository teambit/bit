//! Pin a deleted lane dependency through the shared Rust workspace policy editor.

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

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
const REASON: &str = "delete (pin deleted-on-lane deps to main)";

pub(super) struct Policy {
    before: Vec<u8>,
    document: Document,
    item: String,
}
impl Policy {
    pub(super) fn prepare(root: &Path, pin: Option<&Pin>) -> io::Result<Option<Self>> {
        let Some(pin) = pin else {
            return Ok(None);
        };
        let before = fs::read(root.join("workspace.jsonc"))?;
        let mut document =
            Document::parse(std::str::from_utf8(&before).map_err(io::Error::other)?)?;
        let version = range(&document, &pin.version)?;
        add_root_policy_entries(
            &mut document,
            &[(pin.package_name.clone(), version.clone())],
            ExistingEntries::Skip,
        )?;
        Ok(Some(Self { before, document, item: format!("{}@{version}", pin.package_name) }))
    }
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
    pub(super) fn report(&self, format: &Formatter) -> String {
        format.section("pinned deleted components to their main version", "these components were deleted from the lane but still have dependents in the workspace, so they were added to the workspace policy to be installed from main", &[format.item(&self.item)])
    }
}
fn range(document: &Document, tag: &str) -> io::Result<String> {
    let version = Version::parse(tag).map_err(io::Error::other)?;
    if version.is_prerelease() {
        return Ok(tag.to_owned());
    }
    let prefix = document.get(&[RESOLVER, "savePrefix"]);
    let prefix = match &prefix {
        None | Some(Value::Null) => "^",
        Some(Value::String(prefix)) if prefix.is_empty() => "^",
        Some(Value::String(prefix)) => prefix.as_str(),
        _ => return Err(io::Error::other("unsupported save prefix")),
    };
    let range = format!("{prefix}{tag}");
    Range::parse(&range).map_err(io::Error::other)?;
    Ok(range)
}
