//! Init owns errors after its first filesystem effect; it never delegates a partial workspace.
use super::plan::{Action, Plan};
use std::{fs, io, path::Path};

pub(super) fn apply(plan: Plan) -> io::Result<()> {
    for action in plan.actions {
        match action {
            Action::Directory(path) if !path.as_os_str().is_empty() => fs::create_dir_all(path)?,
            Action::Directory(_) => {}
            Action::Remove(path) => remove(&path)?,
            Action::Empty(path) => empty(&path)?,
            Action::File(path, bytes) => {
                if let Some(parent) = path
                    .parent()
                    .filter(|dir| !dir.as_os_str().is_empty())
                {
                    fs::create_dir_all(parent)?;
                }
                fs::write(path, bytes)?;
            }
        }
    }
    Ok(())
}
fn remove(path: &Path) -> io::Result<()> {
    if path.as_os_str().is_empty() {
        return Ok(());
    }
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            fs::remove_dir_all(path)
        }
        Ok(_) => remove_leaf(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
#[cfg(not(windows))]
fn remove_leaf(path: &Path) -> io::Result<()> {
    fs::remove_file(path)
}
#[cfg(windows)]
fn remove_leaf(path: &Path) -> io::Result<()> {
    use std::os::windows::fs::FileTypeExt;
    if fs::symlink_metadata(path)?.file_type().is_symlink_dir() {
        fs::remove_dir(path)
    } else {
        fs::remove_file(path)
    }
}

fn empty(path: &Path) -> io::Result<()> {
    if path.as_os_str().is_empty() {
        return Ok(());
    }
    fs::create_dir_all(path)?;
    for entry in fs::read_dir(path)? {
        remove(&entry?.path())?;
    }
    Ok(())
}
