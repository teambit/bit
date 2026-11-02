//! `fs.realpathSync` resolves links while preserving ordinary names, including DOS short names (`bit ci init`).
//!
//! Exposes [`real`] to resolve symlinked paths up to 64 levels deep.
#[cfg(test)]
mod tests;

use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

/// Resolves symbolic links along `path` up to 64 levels while preserving ordinary component names.
#[inline]
pub(super) fn real(path: &Path) -> io::Result<PathBuf> {
    if path.as_os_str().is_empty()
        || path
            .as_os_str()
            .as_encoded_bytes()
            .iter()
            .all(u8::is_ascii_whitespace)
        || !path.exists()
    {
        return Ok(path.to_owned());
    }
    let mut resolved = normalize(&std::path::absolute(path)?);
    for _ in 0..64 {
        let Some(link) = resolve_link(&resolved)? else {
            return Ok(resolved);
        };
        resolved = link;
    }
    Err(io::Error::other("too many symbolic link levels"))
}
/// Resolves the first symbolic link component along `path`, returning `Ok(None)` if none is a symlink.
#[inline]
fn resolve_link(path: &Path) -> io::Result<Option<PathBuf>> {
    let mut current = PathBuf::new();
    let mut parts = path.components();
    while let Some(part) = parts.next() {
        current.push(part.as_os_str());
        if !matches!(part, Component::Normal(_)) {
            continue;
        }
        if fs::symlink_metadata(&current)?.file_type().is_symlink() {
            // Node checks the target before reading the link, including broken links and cycles.
            fs::metadata(&current)?;
            let link = fs::read_link(&current)?;
            if link.as_os_str().is_empty() {
                return Err(io::Error::other("empty symbolic link target"));
            }
            let parent = current.parent().unwrap_or_else(|| Path::new(""));
            return Ok(Some(normalize(&parent.join(link).join(parts.as_path()))));
        }
    }
    Ok(None)
}
/// Normalizes `.` and `..` components in `path` without touching the filesystem for [`real`] and [`resolve_link`].
#[inline]
fn normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::with_capacity(path.as_os_str().len());
    for part in path.components() {
        match part {
            Component::ParentDir => {
                if matches!(result.components().next_back(), Some(Component::Normal(_))) {
                    result.pop();
                } else if !result.has_root() {
                    result.push(part.as_os_str());
                }
            }
            Component::CurDir => {}
            _ => result.push(part.as_os_str()),
        }
    }
    result
}
