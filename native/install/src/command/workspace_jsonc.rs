//! Edits of `workspace.jsonc` the way `WorkspaceConfig.write` makes them: the
//! comment-preserving document is rewritten whole, after a backup into
//! `<scope>/workspace-config-history`.

#[cfg(test)]
mod tests;

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
    fs::write(&path, platform_eol(&format!("{document}\n")))
}

fn backup(path: &Path, scope_path: &Path, file_id: &str, reason: &str) -> io::Result<()> {
    let file_id = file_id.trim();
    if file_id.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "backup file_id is empty"));
    }
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

// JsonVinyl persists through AbstractVinyl's eol.auto, after backing up the original bytes.
fn platform_eol(text: &str) -> String {
    let lf = text.replace("\r\n", "\n").replace('\r', "\n");
    if cfg!(windows) { lf.replace('\n', "\r\n") } else { lf }
}
