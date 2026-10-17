use super::error;
use serde_json::Value;
use std::io;

/// Published `bit add` inputs; environment resolution supplies `config` metadata.
#[derive(Default, Clone)]
pub struct Options {
    pub paths: Vec<String>,
    pub id: Option<String>,
    pub main: Option<String>,
    pub namespace: Option<String>,
    pub scope: Option<String>,
    pub override_files: bool,
    pub workspace_root: bool,
    pub config: Value,
}
impl Options {
    pub(super) fn validate(&self, directories: &[String], bitmap: &Value) -> io::Result<()> {
        if self.id.is_some() && self.namespace.is_some() {
            return Err(error(
                "please use either [id] or [namespace] to add a particular component - they cannot be used together",
            ));
        }
        let tracks_root = directories
            .iter()
            .any(|directory| directory == ".");
        let existing_root = bitmap
            .as_object()
            .is_some_and(|rows| {
                rows.values()
                    .any(|row| row["rootDir"] == "." && super::active(row))
            });
        if tracks_root && !self.workspace_root && !existing_root {
            return Err(error(
                "unable to track the workspace root without the --root flag.\nit makes the workspace itself a component - it owns every file no other component claims, .bitmap included, and every other component becomes a member of it.\nif that is what you want, run \"bit add . --root\". to track a component, pass its directory, e.g. \"bit add my-component\"",
            ));
        }
        if !tracks_root && self.workspace_root {
            return Err(error(
                "the --root flag tracks the workspace root, but none of the given paths is the workspace root.\nrun \"bit add . --root\" from the workspace root, or drop the flag to track the given paths as ordinary components",
            ));
        }
        if directories.len() > 1
            && let Some(id) = &self.id
        {
            return Err(error(format!(
                "the --id flag ({id}) is used for a single component only, however, got {} paths",
                self.paths.len(),
            )));
        }
        Ok(())
    }
}
