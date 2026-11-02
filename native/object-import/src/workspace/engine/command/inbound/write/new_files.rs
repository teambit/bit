//! Retain new target source writes ([`prepare`], [`Planning`], [`WorkspaceFiles`]) and exact overwritten preimages.

use super::{Planning, Replacement, WorkspaceFiles, existing, invalid, safe_destination};
use std::{fs, io, path::PathBuf};

#[inline]
pub(super) fn prepare(
    context: &Planning<'_>,
    files: Vec<(PathBuf, Vec<u8>)>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    changes.additions.reserve(files.len());
    for (path, after) in files {
        prepare_one(context, path, after, changes)?;
    }
    Ok(())
}

#[inline]
fn prepare_one(
    context: &Planning<'_>,
    path: PathBuf,
    after: Vec<u8>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    if after.len() > super::MAX_WRITTEN_BYTES
        || changes.additions
            .iter()
            .any(|(existing, _)| existing == &path)
        || changes.replacements
            .iter()
            .any(|existing| existing.path == path)
    {
        return Err(invalid("inbound workspace materialization bytes"));
    }
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            safe_destination(context.root, &path)?;
            changes.additions.push((path, after));
            Ok(())
        }
        Ok(metadata)
            if context.override_existing
                && metadata.is_file()
                && !metadata.file_type().is_symlink() =>
        {
            let before = existing::current_body(context.root, &path)?;
            if before != after {
                changes.replacements.push(Replacement { path, before, after });
            }
            Ok(())
        }
        Ok(_) => Err(invalid("inbound workspace destination occupied")),
        Err(error) => Err(error),
    }
}
