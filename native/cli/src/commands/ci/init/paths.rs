//! `fs.realpathSync` resolves links while preserving ordinary names, including DOS short names.
#[cfg(test)]
mod tests;

use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

pub(super) fn real(path: &Path) -> io::Result<PathBuf> {
    if path.as_os_str().is_empty() || path.to_string_lossy().trim().is_empty() || !path.exists() {
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
            let parent = current.parent().unwrap_or_else(|| Path::new(""));
            let target = parent.join(fs::read_link(&current)?);
            return Ok(Some(normalize(&target.join(parts.as_path()))));
        }
    }
    Ok(None)
}
fn normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                if matches!(result.components().next_back(), Some(Component::Normal(_))) {
                    result.pop();
                }
            }
            Component::CurDir => {}
            _ => result.push(part.as_os_str()),
        }
    }
    result
}
