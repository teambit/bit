//! Move an existing history to a qualified local trash directory before rebuilding.
use super::{Plan, existing_mode, filesystem_error};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[cfg(unix)]
pub(super) fn target(root: &Path, source: &Path) -> Option<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let bucket = source.parent()?.file_name()?;
    let trash = root.join("trash");
    let parent = trash.join(bucket);
    for directory in [&trash, &parent] {
        let metadata = fs::symlink_metadata(directory).ok()?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return None;
        }
    }
    if fs::metadata(source).ok()?.dev() != fs::metadata(&parent).ok()?.dev() {
        return None;
    }
    let destination = parent.join(source.file_name()?);
    super::absent(&destination).then_some(destination)
}

#[cfg(not(unix))]
pub(super) fn target(_root: &Path, _source: &Path) -> Option<PathBuf> {
    None
}

pub(super) fn move_history(plan: &mut Plan, root: &Path) -> io::Result<()> {
    for (path, bytes) in &plan.proofs {
        if fs::read(path)? != *bytes {
            return Err(io::Error::other("version-history input changed"));
        }
    }
    if existing_mode(&plan.path) != plan.mode {
        return Err(io::Error::other("version-history mode changed"));
    }
    let target =
        target(root, &plan.path).ok_or_else(|| io::Error::other("version-history trash changed"))?;
    fs::rename(&plan.path, &target)
        .map_err(|error| filesystem_error::paired_failure(error, "rename", &plan.path, &target))?;
    for (path, _) in &mut plan.proofs {
        if *path == plan.path {
            path.clone_from(&target);
        }
    }
    plan.mode = None;
    Ok(())
}
