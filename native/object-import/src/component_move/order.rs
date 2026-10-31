//! `ComponentMap`'s globby file order: breadth first, with native Windows enumeration.
use super::{paths, unsupported};
use std::{
    collections::{HashSet, VecDeque},
    fs, io,
    path::{Path, PathBuf},
};
pub(super) fn files(root: &Path, directory: &str, files: &[String]) -> io::Result<Vec<String>> {
    let mut remaining = files
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let mut pending = VecDeque::from([root.join(directory)]);
    let mut ordered = vec![];
    while let Some(parent) = pending.pop_front() {
        let entries = entries(&parent)?;
        let mut directories = vec![];
        for child in entries {
            let relative = paths::relative(root, &child)?;
            if remaining.remove(&relative) {
                ordered.push(relative);
            } else if child.is_dir() && contains_files(&remaining, &relative) {
                directories.push(child);
            }
        }
        pending.extend(directories);
    }
    if !remaining.is_empty() {
        return Err(unsupported("move tracked inventory changed"));
    }
    Ok(ordered)
}
fn contains_files(files: &HashSet<String>, directory: &str) -> bool {
    let trimmed = directory.trim().trim_end_matches('/');
    if trimmed.is_empty() || trimmed == "." {
        return !files.is_empty();
    }
    let prefix = format!("{trimmed}/");
    files
        .iter()
        .any(|file| file.starts_with(&prefix))
}
fn entries(directory: &Path) -> io::Result<Vec<PathBuf>> {
    let mut entries = fs::read_dir(directory)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<io::Result<Vec<_>>>()?;
    if !cfg!(windows) {
        entries.sort();
    }
    Ok(entries)
}
