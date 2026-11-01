//! Scope-wide identity selection and default-scope publication preceding retained batch rename.
pub use crate::component_rename::batch::Batch;
mod configuration;
mod selection;
#[cfg(test)]
mod tests;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub old: String,
    pub new: String,
    pub owner: bool,
    pub preserve: bool,
    pub refactor: bool,
    pub deprecate: bool,
    pub skip_install: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Selection {
    root: PathBuf,
    before: Vec<u8>,
    bitmap: Vec<u8>,
    pub entries: Vec<crate::component_rename::Options>,
    pub default_scope: Option<String>,
    key: String,
}
impl Selection {
    pub fn prepare(root: &Path, options: &Options) -> io::Result<Self> {
        if !root.is_absolute() || options.old.trim().is_empty() || options.new.trim().is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "scope rename requires workspace root and non-empty old/new scopes",
            ));
        }
        let before = fs::read(root.join("workspace.jsonc"))?;
        let bitmap = fs::read(root.join(".bitmap"))?;
        let workspace = crate::parse_jsonc(&before)?;
        let key = workspace_aspect_key(&workspace);
        let default = workspace[key]["defaultScope"].as_str().map_or("", str::trim);
        let entries =
            selection::entries_with_default(&crate::parse_jsonc(&bitmap)?, default, options)?;
        let default_scope = selection::scope(default, options);
        if let Some(scope) = &default_scope {
            if scope == default {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!(r#"the default-scope is already set as "{scope}", nothing to change"#),
                ));
            }
            selection::validate_scope(scope)?;
        }
        for entry in &entries {
            if let Some(scope) = &entry.scope {
                selection::validate_scope(scope)?;
            }
        }
        if entries.is_empty() && default_scope.is_none() {
            let old = options.old.trim();
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    r#"none of the components is using "{old}". also, the workspace is not configured with "{old}""#,
                ),
            ));
        }
        Ok(Self { root: root.into(), before, bitmap, entries, default_scope, key: key.to_owned() })
    }
    pub fn validate(&self) -> io::Result<()> {
        for (path, expected) in [
            (self.root.join("workspace.jsonc"), &self.before),
            (self.root.join(".bitmap"), &self.bitmap),
        ] {
            let metadata = fs::symlink_metadata(&path)?;
            if !metadata.is_file()
                || metadata.file_type().is_symlink()
                || u64::try_from(expected.len()).ok() != Some(metadata.len())
                || fs::read(&path)? != *expected
            {
                return Err(io::Error::other("scope rename inputs changed"));
            }
        }
        Ok(())
    }
    #[inline]
    pub fn publish_default(&self, file_id: &str) -> io::Result<()> {
        self.validate()?;
        if let Some(scope) = &self.default_scope {
            configuration::publish(&self.root, &self.before, &self.key, scope, file_id)?;
        }
        Ok(())
    }
}

#[inline]
fn workspace_aspect_key(workspace: &Value) -> &str {
    workspace
        .as_object()
        .and_then(|rows| {
            rows.keys()
                .find(|key| {
                    let trimmed = key.trim();
                    let bare =
                        trimmed.rsplit_once('@').map_or(trimmed, |(prefix, _)| prefix.trim());
                    bare == "teambit.workspace/workspace"
                })
                .map(String::as_str)
        })
        .unwrap_or("teambit.workspace/workspace")
}
