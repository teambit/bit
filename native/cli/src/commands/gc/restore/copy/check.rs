//! fs-extra checks entry identity and directory conflicts before skipping existing files.
use super::failure;
use std::{fs, io, path::Path};

pub(super) fn target(
    source: &Path,
    target: &Path,
    metadata: &fs::Metadata,
    existing: Option<&fs::Metadata>,
) -> io::Result<()> {
    if source.as_os_str().is_empty() || target.as_os_str().is_empty() || source == target {
        return Err(io::Error::other("Source and destination must not be the same."));
    }
    if let Some(existing) = existing {
        entry_types(source, target, metadata, existing)?;
    }
    if metadata.is_dir() && target.starts_with(source) {
        return Err(subdirectory(source, target));
    }
    Ok(())
}
pub(super) fn parents(source: &Path, target: &Path, metadata: &fs::Metadata) -> io::Result<()> {
    for parent in target.ancestors().skip(1) {
        if Some(parent) == source.parent() || parent.parent().is_none() {
            break;
        }
        match fs::metadata(parent) {
            Ok(existing) if identical(metadata, &existing) => {
                return Err(subdirectory(source, target));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => break,
            Err(error) => return Err(failure(error, "stat", parent)),
        }
    }
    Ok(())
}
fn subdirectory(source: &Path, target: &Path) -> io::Error {
    io::Error::other(format!(
        "Cannot copy '{}' to a subdirectory of itself, '{}'.",
        source.display(),
        target.display(),
    ))
}
#[cfg(unix)]
fn identical(first: &fs::Metadata, second: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    first.ino() != 0
        && first.dev() != 0
        && first.ino() == second.ino()
        && first.dev() == second.dev()
}
#[cfg(not(unix))]
fn identical(_: &fs::Metadata, _: &fs::Metadata) -> bool {
    false
}

fn entry_types(
    source: &Path,
    target: &Path,
    metadata: &fs::Metadata,
    existing: &fs::Metadata,
) -> io::Result<()> {
    if identical(metadata, existing) {
        return Err(io::Error::other("Source and destination must not be the same."));
    }
    if metadata.is_dir() != existing.is_dir() {
        let (old, new) = if existing.is_dir() {
            ("directory", "non-directory")
        } else {
            ("non-directory", "directory")
        };
        return Err(io::Error::other(format!(
            "Cannot overwrite {old} '{}' with {new} '{}'.",
            target.display(),
            source.display(),
        )));
    }
    Ok(())
}
