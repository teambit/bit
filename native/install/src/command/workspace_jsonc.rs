//! Edits of `workspace.jsonc` the way `WorkspaceConfig.write` makes them: the
//! comment-preserving document is rewritten whole, after a backup into
//! `<scope>/workspace-config-history`.

use crate::jsonc::Document;
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::Path,
};

const FILE: &str = "workspace.jsonc";

/// Apply `edit` to the workspace config and write it, recording `reason` in the history.
pub fn edit(
    root: &Path,
    scope_path: &Path,
    file_id: &str,
    reason: &str,
    edit: impl FnOnce(&mut Document),
) -> io::Result<()> {
    let path = root.join(FILE);
    let mut document = Document::parse(&fs::read_to_string(&path)?)?;
    edit(&mut document);
    // A failed backup never fails the command (`backupConfigFile`).
    let _ = backup(&path, scope_path, file_id, reason);
    fs::write(&path, format!("{document}\n"))
}

fn backup(path: &Path, scope_path: &Path, file_id: &str, reason: &str) -> io::Result<()> {
    let directory = scope_path.join("workspace-config-history");
    let files = directory.join("files");
    fs::create_dir_all(&files)?;
    fs::copy(path, files.join(file_id))?;
    let mut metadata = OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("metadata.txt"))?;
    writeln!(metadata, "{file_id} {reason}")
}

#[cfg(test)]
mod tests;
