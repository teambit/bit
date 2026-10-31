//! Move an existing history to a qualified local trash directory before rebuilding.
use super::{Plan, existing_mode, filesystem_error};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[cfg(unix)]
pub(super) fn target(root: &Path, source: &Path) -> Option<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let bucket = source
        .parent()?
        .file_name()
        .filter(|name| !name.is_empty())?;
    let trash = root.join("trash");
    let parent = trash.join(bucket);
    let device = fs::metadata(source).ok()?.dev();
    if fs::metadata(root).ok()?.dev() != device {
        return None;
    }
    for directory in [&trash, &parent] {
        valid_directory(directory, device)?;
    }
    let destination = parent.join(source.file_name()?);
    match fs::symlink_metadata(&destination) {
        Ok(metadata)
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && (metadata.dev(), metadata.ino())
                    != (device, fs::metadata(source).ok()?.ino()) =>
        {
            Some(destination)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Some(destination),
        _ => None,
    }
}

#[cfg(unix)]
fn valid_directory(path: &Path, device: u64) -> Option<()> {
    use std::os::unix::fs::MetadataExt;
    match fs::symlink_metadata(path) {
        Ok(metadata)
            if metadata.is_dir()
                && !metadata.file_type().is_symlink()
                && metadata.dev() == device =>
        {
            Some(())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Some(()),
        _ => None,
    }
}

#[cfg(not(unix))]
pub(super) fn target(_root: &Path, _source: &Path) -> Option<PathBuf> {
    None
}

pub(super) fn move_history(plan: &mut Plan, root: &Path) -> io::Result<()> {
    verify_proofs(plan)?;
    let target =
        target(root, &plan.path).ok_or_else(|| io::Error::other("version-history trash changed"))?;
    let expected = plan.proofs
        .iter()
        .any(|(path, _)| path == &target);
    if expected == super::absent(&target) {
        return Err(io::Error::other("version-history trash changed"));
    }
    let parent = target.parent().ok_or_else(|| io::Error::other("version-history trash path"))?;
    fs::create_dir_all(parent).map_err(|error| filesystem_error::failure(error, "mkdir", parent))?;
    if expected {
        fs::remove_file(&target)
            .map_err(|error| filesystem_error::failure(error, "unlink", &target))?;
    }
    fs::rename(&plan.path, &target)
        .map_err(|error| filesystem_error::paired_failure(error, "rename", &plan.path, &target))?;
    plan.proofs.retain(|(path, _)| path != &target);
    for (path, _) in &mut plan.proofs {
        if *path == plan.path {
            path.clone_from(&target);
        }
    }
    plan.mode = None;
    Ok(())
}

fn verify_proofs(plan: &Plan) -> io::Result<()> {
    for (path, bytes) in &plan.proofs {
        if fs::read(path)? != *bytes {
            return Err(io::Error::other("version-history input changed"));
        }
    }
    if existing_mode(&plan.path) != plan.mode {
        return Err(io::Error::other("version-history mode changed"));
    }
    Ok(())
}
