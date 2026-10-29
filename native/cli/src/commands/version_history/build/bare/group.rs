//! Qualify named groups whose ownership is already the process default.
#[cfg(unix)]
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn qualify_parents(
    root: &Path,
    object: &Path,
    proofs: &[(PathBuf, Vec<u8>)],
) -> Option<()> {
    if !super::safe_parent(root, object) {
        return None;
    }
    if proofs
        .iter()
        .any(|(path, _)| path == Path::new("/etc/group"))
        && !safe_parents(root, object)?
    {
        return None;
    }
    Some(())
}

#[cfg(unix)]
pub(super) fn resolve(name: &str) -> Option<(PathBuf, Vec<u8>)> {
    let path = PathBuf::from("/etc/group");
    let bytes = fs::read(&path).ok()?;
    if bytes.len() > 1024 * 1024 {
        return None;
    }
    let contents = std::str::from_utf8(&bytes).ok()?;
    let line = contents
        .lines()
        .find(|line| line.split(':').next() == Some(name))?;
    let gid: u32 = line.split(':').nth(2)?.parse().ok()?;
    // SAFETY: process identity queries take no arguments and have no side effects.
    let (uid, effective_uid, effective_gid) =
        unsafe { (libc::getuid(), libc::geteuid(), libc::getegid()) };
    if uid != effective_uid || gid != effective_gid {
        return None;
    }
    Some((path, bytes))
}

#[cfg(not(unix))]
pub(super) fn resolve(_name: &str) -> Option<(PathBuf, Vec<u8>)> {
    None
}

#[cfg(unix)]
pub(super) fn safe_parents(root: &Path, object: &Path) -> Option<bool> {
    use std::os::unix::fs::MetadataExt;
    // SAFETY: this identity query takes no arguments and has no side effects.
    let gid = unsafe { libc::getegid() };
    for path in [root.to_owned(), root.join("objects"), object.parent()?.to_owned()] {
        match fs::metadata(path) {
            Ok(metadata) if metadata.mode() & 0o2000 == 0 || metadata.gid() == gid => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            _ => return Some(false),
        }
    }
    Some(true)
}

#[cfg(not(unix))]
pub(super) fn safe_parents(_root: &Path, _object: &Path) -> Option<bool> {
    None
}
