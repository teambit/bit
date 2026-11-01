//! `Repository.removeFile(path, true)` pruning of a deleted object's empty parent directory.
#[cfg(test)]
mod tests;
use super::invalid;
use std::{fs, io, path::Path};

pub(super) fn remove(path: &Path) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| invalid("lane reset object parent"))?;
    if !path.is_absolute() || parent.is_symlink() || path.is_symlink() {
        return Err(invalid("lane reset object symlink"));
    }
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    }
    prune_empty_parent(parent)
}

fn prune_empty_parent(parent: &Path) -> io::Result<()> {
    if parent.is_symlink() {
        return Ok(());
    }
    let empty = match fs::read_dir(parent) {
        Ok(mut entries) => entries.next().transpose()?.is_none(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if empty {
        match fs::remove_dir(parent) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
