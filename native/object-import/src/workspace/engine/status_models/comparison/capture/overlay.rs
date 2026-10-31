//! Callback source spools are private regular files within a Rust-owned temporary root.

#[cfg(test)]
mod tests;

use super::{Target, invalid};
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

pub(super) fn validate(target: &Target) -> io::Result<()> {
    if !target.source_overlays.is_empty() && target.source_overlay_root.is_none() {
        return Err(invalid("source overlay root missing"));
    }
    if target.source_overlays.len() > 4096
        || target.source_overlays
            .keys()
            .any(|file| !target.files.contains(file))
    {
        return Err(invalid("source overlay outside component inventory"));
    }
    if let Some(root) = &target.source_overlay_root
        && (!root.is_absolute()
            || root
                .components()
                .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
            || !fs::symlink_metadata(root)?.is_dir())
    {
        return Err(invalid("source overlay root must be an absolute regular directory"));
    }
    Ok(())
}

pub(super) fn source_path(root: &Path, target: &Target, file: &str) -> io::Result<PathBuf> {
    let Some(path) = target.source_overlays.get(file) else {
        return Ok(root.join(&target.directory).join(file));
    };
    let spool =
        target.source_overlay_root.as_deref().ok_or_else(|| invalid("source overlay root"))?;
    let relative = path.strip_prefix(spool).map_err(|_| invalid("source overlay outside root"))?;
    if !path.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(invalid("source overlay absolute regular path"));
    }
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() {
        return Err(invalid("source overlay must be a regular file"));
    }
    let mut parent = path.parent();
    while let Some(directory) = parent.filter(|directory| *directory != spool) {
        if !fs::symlink_metadata(directory)?.is_dir() {
            return Err(invalid("source overlay parent must be a regular directory"));
        }
        parent = directory.parent();
    }
    Ok(path.clone())
}
