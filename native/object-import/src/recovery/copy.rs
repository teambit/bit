use super::invalid;
use std::{fs, io, path::Path};

/// File copying uses fresh source contents and preserves the existing destination
/// inode while copying source permissions. Unsupported link/platform metadata
/// declines before opening the destination; the caller retries only this step.
pub(super) fn file(source: &Path, destination: &Path) -> io::Result<()> {
    regular(source)?;
    let existing = match fs::symlink_metadata(destination) {
        Ok(_) => Some(regular(destination)?),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    let source_metadata = regular(source)?;
    if existing.as_ref().is_some_and(|destination| same(&source_metadata, destination)) {
        return Err(invalid("copy source and destination are identical"));
    }
    acl(source)?;
    if existing.is_some() {
        acl(destination)?;
    }
    ancestors(source)?;
    ancestors(destination)?;
    fs::copy(source, destination)?;
    Ok(())
}
fn regular(path: &Path) -> io::Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > 32 * 1024 * 1024 || !single(&metadata) {
        return Err(invalid("unsupported recovery copy metadata"));
    }
    Ok(metadata)
}
fn ancestors(path: &Path) -> io::Result<()> {
    for parent in path.ancestors().skip(1) {
        let metadata = fs::symlink_metadata(parent)?;
        acl(parent)?;
        if !metadata.is_dir() {
            return Err(invalid("recovery copy parent is not an ordinary directory"));
        }
    }
    Ok(())
}
#[cfg(unix)]
fn single(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    metadata.nlink() == 1
}
#[cfg(not(unix))]
fn single(_metadata: &fs::Metadata) -> bool {
    false
}
#[cfg(unix)]
fn same(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    left.dev() == right.dev() && left.ino() == right.ino()
}
#[cfg(not(unix))]
fn same(_left: &fs::Metadata, _right: &fs::Metadata) -> bool {
    false
}

#[cfg(target_os = "linux")]
fn acl(path: &Path) -> io::Result<()> {
    if xattr::list(path)?.any(|name| name.to_string_lossy().starts_with("system.posix_acl")) {
        return Err(invalid("unsupported recovery copy ACL"));
    }
    Ok(())
}
#[cfg(not(target_os = "linux"))]
fn acl(_path: &Path) -> io::Result<()> {
    Err(invalid("unqualified recovery copy platform"))
}
