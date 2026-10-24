//! Repository.removeFile(path, true) prunes only the deleted object's empty parent.
#[cfg(test)]
mod tests;
use super::invalid;
use std::{fs, io, path::Path};

pub(super) fn remove(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    }
    let parent = path.parent().ok_or_else(|| invalid("lane reset object parent"))?;
    let mut entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let empty = entries.next().transpose()?.is_none();
    drop(entries);
    if empty {
        match fs::remove_dir(parent) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
