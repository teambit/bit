//! Retain new target source writes and exact overwritten preimages.
use super::{Planning, Replacement, WorkspaceFiles, existing, invalid, safe_destination};
use std::{fs, io, path::PathBuf};

pub(super) fn prepare(
    context: &Planning<'_>,
    files: Vec<(PathBuf, Vec<u8>)>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    for (path, after) in files {
        prepare_one(context, path, after, changes)?;
    }
    Ok(())
}

fn prepare_one(
    context: &Planning<'_>,
    path: PathBuf,
    after: Vec<u8>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            safe_destination(context.root, &path)?;
            changes.additions.push((path, after));
            Ok(())
        }
        Ok(_) if context.override_existing => {
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
