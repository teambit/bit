//! Scope-wide identity selection and default-scope publication precede retained batch rename.
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
#[derive(Default, Clone)]
pub struct Options {
    pub old: String,
    pub new: String,
    pub owner: bool,
    pub preserve: bool,
    pub refactor: bool,
    pub deprecate: bool,
    pub skip_install: bool,
}
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
        let before = fs::read(root.join("workspace.jsonc"))?;
        let bitmap = fs::read(root.join(".bitmap"))?;
        let workspace = crate::parse_jsonc(&before)?;
        let key = workspace_aspect_key(&workspace);
        let default = workspace[&key]["defaultScope"].as_str().map_or("", str::trim);
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
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    r#"none of the components is using "{}". also, the workspace is not configured with "{}""#,
                    options.old, options.old,
                ),
            ));
        }
        Ok(Self { root: root.into(), before, bitmap, entries, default_scope, key })
    }
    pub fn validate(&self) -> io::Result<()> {
        if fs::read(self.root.join("workspace.jsonc"))? != self.before
            || fs::read(self.root.join(".bitmap"))? != self.bitmap
        {
            return Err(io::Error::other("scope rename inputs changed"));
        }
        Ok(())
    }
    pub fn publish_default(&self, file_id: &str) -> io::Result<()> {
        self.validate()?;
        if let Some(scope) = &self.default_scope {
            configuration::publish(&self.root, &self.before, &self.key, scope, file_id)?;
        }
        Ok(())
    }
}

fn workspace_aspect_key(workspace: &Value) -> String {
    workspace
        .as_object()
        .and_then(|rows| {
            rows.keys()
                .find(|key| key.split('@').next() == Some("teambit.workspace/workspace"))
        })
        .cloned()
        .unwrap_or_else(|| "teambit.workspace/workspace".into())
}
