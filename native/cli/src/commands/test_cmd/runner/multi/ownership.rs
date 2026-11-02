//! Validate component path ownership before running a shared tester.
//!
//! [`validate`] checks [`Component`] directories under [`Path`] roots for non-overlapping, canonical paths.
use super::{Component, Path, invalid, io};
use std::fs;

/// Validates that all `components` in `root` have non-empty, non-overlapping, symlink-free directories.
pub(super) fn validate(root: &Path, components: &[Component]) -> io::Result<()> {
    if components
        .iter()
        .any(|component| component.directory.trim().is_empty())
    {
        return Err(invalid("tester empty component directory"));
    }
    let root = super::super::paths::normalized(root);
    let roots: Vec<_> = components
        .iter()
        .map(|component| super::super::paths::normalized(&root.join(component.directory.trim())))
        .collect();
    for (index, directory) in roots.iter().enumerate() {
        if has_glob_metacharacters(directory) {
            return Err(invalid("tester glob metacharacters in component root"));
        }
        if roots[index + 1..].iter().any(|path| overlaps(directory, path)) {
            return Err(invalid("tester overlapping component roots"));
        }
        check(&root, directory)?;
        reject_symlinks(directory)?;
        validate_sources(directory, &components[index])?;
    }
    Ok(())
}
/// Verifies that every source file in `component.files` resides under `directory`.
#[inline]
fn validate_sources(directory: &Path, component: &Component) -> io::Result<()> {
    for file in &component.files {
        let path = file["absolutePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("tester component source"))?;
        let path = super::super::paths::normalized(Path::new(path));
        if !path.starts_with(directory) {
            return Err(invalid("tester component source ownership"));
        }
    }
    Ok(())
}

#[inline]
fn check(root: &Path, path: &Path) -> io::Result<()> {
    let relative = path.strip_prefix(root).map_err(|_| invalid("tester source root"))?;
    let mut current = root.to_path_buf();
    for part in relative.components() {
        current.push(part);
        if fs::symlink_metadata(&current)?.file_type().is_symlink() {
            return Err(invalid("tester symlinked component path"));
        }
    }
    Ok(())
}

fn reject_symlinks(directory: &Path) -> io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            return Err(invalid("tester symlinked component tree"));
        }
        if kind.is_dir() {
            reject_symlinks(&entry.path())?;
        }
    }
    Ok(())
}

#[inline]
fn has_glob_metacharacters(directory: &Path) -> bool {
    directory
        .to_string_lossy()
        .chars()
        .any(|character| "*?[]{}()!".contains(character))
}

#[inline]
fn overlaps(left: &Path, right: &Path) -> bool {
    left.starts_with(right) || right.starts_with(left)
}
