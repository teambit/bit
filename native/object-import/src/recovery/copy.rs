//! Validated regular-file copy ([`file`], [`validate`]) with symlink, hard-link, and ancestor-directory guards.

#[cfg(windows)]
mod windows;

use super::invalid;
use std::{fs, io, path::Path};

/// File copying uses fresh source contents and preserves the existing destination
/// inode while copying source permissions. Unsupported link/platform metadata
/// declines before opening the destination; the caller retries only this step.
#[inline]
pub(crate) fn file(source: &Path, destination: &Path) -> io::Result<()> {
    validate(source, destination)?;
    fs::copy(source, destination)?;
    Ok(())
}
/// Validates regular-file, symlink, hard-link, and ancestor-directory invariants before copying `source` to `destination`.
pub(crate) fn validate(source: &Path, destination: &Path) -> io::Result<()> {
    super::path(source)?;
    super::path(destination)?;
    let source_metadata = regular(source, fs::symlink_metadata(source)?)?;
    let existing = match fs::symlink_metadata(destination) {
        Ok(metadata) => Some(regular(destination, metadata)?),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    if let Some(metadata) = &existing {
        distinct(source, destination, &source_metadata, metadata)?;
    }
    acl(source)?;
    if existing.is_some() {
        acl(destination)?;
    }
    ancestors(source)?;
    if source.parent() != destination.parent() {
        ancestors(destination)?;
    }
    Ok(())
}
/// Verifies that `metadata` describes an ordinary regular file within the 32 MiB recovery budget.
fn regular(path: &Path, metadata: fs::Metadata) -> io::Result<fs::Metadata> {
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 32 * 1024 * 1024
    {
        return Err(invalid("unsupported recovery copy metadata"));
    }
    links(path, &metadata)?;
    Ok(metadata)
}
/// Validates that every ancestor directory of `path` is an ordinary non-symlink directory without extended ACLs.
fn ancestors(path: &Path) -> io::Result<()> {
    for parent in path.ancestors().skip(1) {
        let metadata = fs::symlink_metadata(parent)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(invalid("recovery copy parent is not an ordinary directory"));
        }
        acl(parent)?;
    }
    Ok(())
}
/// Verifies that `metadata` has a single hard link (`nlink() == 1`) on Unix platforms.
#[cfg(unix)]
fn links(_path: &Path, metadata: &fs::Metadata) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    if metadata.nlink() != 1 {
        return Err(invalid("unsupported recovery copy metadata"));
    }
    Ok(())
}
#[cfg(windows)]
fn links(path: &Path, _metadata: &fs::Metadata) -> io::Result<()> {
    if !windows::single(path)? {
        return Err(invalid("unsupported recovery copy metadata"));
    }
    Ok(())
}
#[cfg(not(any(unix, windows)))]
fn links(_path: &Path, _metadata: &fs::Metadata) -> io::Result<()> {
    Err(invalid("unqualified recovery copy platform"))
}
#[cfg(unix)]
fn distinct(
    _source: &Path,
    _destination: &Path,
    left: &fs::Metadata,
    right: &fs::Metadata,
) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    if left.dev() == right.dev() && left.ino() == right.ino() {
        return Err(invalid("copy source and destination are identical"));
    }
    Ok(())
}
#[cfg(windows)]
fn distinct(
    source: &Path,
    destination: &Path,
    _left: &fs::Metadata,
    _right: &fs::Metadata,
) -> io::Result<()> {
    if same_file::is_same_file(source, destination)? {
        return Err(invalid("copy source and destination are identical"));
    }
    Ok(())
}
#[cfg(not(any(unix, windows)))]
fn distinct(
    _source: &Path,
    _destination: &Path,
    _left: &fs::Metadata,
    _right: &fs::Metadata,
) -> io::Result<()> {
    Err(invalid("unqualified recovery copy platform"))
}

#[cfg(target_os = "linux")]
fn acl(path: &Path) -> io::Result<()> {
    if xattr::list(path)?.any(|name| name.as_encoded_bytes().starts_with(b"system.posix_acl")) {
        return Err(invalid("unsupported recovery copy ACL"));
    }
    Ok(())
}
#[cfg(windows)]
fn acl(_path: &Path) -> io::Result<()> {
    // Node's fs.copyFile and std::fs::copy both use the Win32 copy API:
    // the destination security descriptor stays in place (or is inherited).
    Ok(())
}
#[cfg(not(any(target_os = "linux", windows)))]
fn acl(_path: &Path) -> io::Result<()> {
    Err(invalid("unqualified recovery copy platform"))
}
