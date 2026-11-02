//! [`validate`] native destination paths against Bit's slash-separated file identities.

#[cfg(test)]
mod tests;
use super::invalid;
use std::{
    fs, io,
    path::{Component, Path},
};

/// Validates that `path` is a canonical relative ordinary destination under `root`.
#[inline]
pub(super) fn validate(root: &Path, path: &Path) -> io::Result<()> {
    let relative = path.strip_prefix(root).map_err(io::Error::other)?;
    canonical_relative(relative)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata)
                if current == path && metadata.is_file()
                    || current != path && metadata.is_dir() => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
            _ => return Err(invalid("merge nonordinary destination")),
        }
    }
    Ok(())
}

/// Verifies that `path` consists of clean normal relative segments outside `.bitmap`, `.bit`, and `.git`.
#[inline]
fn canonical_relative(path: &Path) -> io::Result<()> {
    let raw = path.to_str().ok_or_else(|| invalid("merge nonUTF8 path"))?;
    if raw.trim().is_empty()
        || raw.len() > 4096
        || raw.chars().any(char::is_control)
        || raw
            .split(std::path::is_separator)
            .any(|segment| segment.trim().is_empty() || segment == ".")
    {
        return Err(invalid("merge nonrelative destination"));
    }
    let segments = path
        .components()
        .map(|component| {
            let Component::Normal(name) = component else {
                return Err(invalid("merge nonrelative destination"));
            };
            name.to_str().ok_or_else(|| invalid("merge nonUTF8 path"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if matches!(segments.as_slice(), [] | [".bitmap"] | [".bit" | ".git", ..]) {
        return Err(invalid("merge nonrelative destination"));
    }
    crate::checkout::plan::relative_path(&segments.join("/"))
}
