//! Move an existing history to a qualified local trash directory before rebuilding.
//!
//! Computes [`target`] trash [`PathBuf`] locations and applies [`Plan`] moves ([`existing_mode`]) with [`filesystem_error`] reporting.
use super::{Plan, existing_mode, filesystem_error};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Resolves a validated same-device trash destination [`PathBuf`] for `source` under `root/trash`.
#[cfg(unix)]
pub(super) fn target(root: &Path, source: &Path) -> Option<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let bucket = non_empty_os_name(source.parent()?.file_name())?;
    let trash = root.join("trash");
    let parent = trash.join(bucket);
    let source_meta = fs::symlink_metadata(source).ok()?;
    if !source_meta.is_file() || source_meta.file_type().is_symlink() {
        return None;
    }
    let device = source_meta.dev();
    if fs::metadata(root).ok()?.dev() != device {
        return None;
    }
    for directory in [&trash, &parent] {
        valid_directory(directory, device)?;
    }
    let file_name = non_empty_os_name(source.file_name())?;
    let destination = parent.join(file_name);
    match fs::symlink_metadata(&destination) {
        Ok(metadata)
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && (metadata.dev(), metadata.ino()) != (device, source_meta.ino()) =>
        {
            Some(destination)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Some(destination),
        _ => None,
    }
}

/// Returns `name` when it is non-empty and not whitespace-only.
#[cfg(unix)]
#[inline]
fn non_empty_os_name(name: Option<&std::ffi::OsStr>) -> Option<&std::ffi::OsStr> {
    name.filter(|name| {
        !name.is_empty()
            && name
                .to_str()
                .is_none_or(|text| !text.trim().is_empty())
    })
}

#[cfg(unix)]
#[inline]
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
#[inline]
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

#[inline]
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
