//! Ancestor directory metadata [`proof`] [`capture`] and [`ordinary_directory_metadata`] for reset destinations.

use super::{invalid, proof};
use std::{fs, io, path::Path};

/// Captures [`ordinary_directory_metadata`] [`proof::Proof`] records for every ancestor [`Path`] of `destination` up to `root`.
#[inline]
pub(super) fn capture(
    root: &Path,
    destination: &Path,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let Ok(rel) = destination.strip_prefix(root) else {
        return Err(invalid("reset config outside workspace"));
    };
    if rel.as_os_str().is_empty()
        || destination.file_name().is_none()
        || rel
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return Err(invalid("reset config outside workspace"));
    }
    for (depth, parent) in destination
        .ancestors()
        .skip(1)
        .enumerate()
    {
        if depth > 64 {
            return Err(invalid("reset config ancestor depth"));
        }
        let metadata = ordinary_directory_metadata(parent)?;
        proofs.push(proof::metadata(parent, Some(&metadata))?);
        if parent == root {
            return Ok(());
        }
    }
    Err(invalid("reset config workspace ancestor"))
}

/// Returns `symlink_metadata(parent)` after verifying `parent` is a non-symlink directory.
#[inline]
fn ordinary_directory_metadata(parent: &Path) -> io::Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(parent)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(invalid("reset config ancestor is not ordinary"));
    }
    Ok(metadata)
}
