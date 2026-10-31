//! Validate component path ownership before running a shared tester.
use super::{Component, Path, invalid, io};
use std::fs;

pub(super) fn validate(root: &Path, components: &[Component]) -> io::Result<()> {
    let roots: Vec<_> = components
        .iter()
        .map(|component| super::super::paths::normalized(&root.join(&component.directory)))
        .collect();
    for (index, directory) in roots.iter().enumerate() {
        if has_glob_metacharacters(directory) {
            return Err(invalid("tester glob metacharacters in component root"));
        }
        if roots
            .iter()
            .enumerate()
            .any(|(other, path)| other != index && overlaps(directory, path))
        {
            return Err(invalid("tester overlapping component roots"));
        }
        check(root, directory)?;
        reject_symlinks(directory)?;
        validate_sources(root, directory, &components[index])?;
    }
    Ok(())
}
fn validate_sources(root: &Path, directory: &Path, component: &Component) -> io::Result<()> {
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
        check(root, &path)?;
    }
    Ok(())
}

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

fn has_glob_metacharacters(directory: &Path) -> bool {
    directory
        .to_string_lossy()
        .chars()
        .any(|character| "*?[]{}()!".contains(character))
}

fn overlaps(left: &Path, right: &Path) -> bool {
    if left.starts_with(right) {
        return true;
    }
    right.starts_with(left)
}
