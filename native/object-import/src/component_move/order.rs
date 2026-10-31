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
        .map(|file| {
            file.trim()
                .replace('\\', "/")
                .trim_matches('/')
                .to_owned()
        })
        .filter(|file| !file.is_empty())
        .collect::<HashSet<_>>();
    let mut pending = VecDeque::from([root.join(directory.trim().trim_matches('/'))]);
    let mut ordered = vec![];
    while let Some(parent) = pending.pop_front() {
        let entries = entries(&parent)?;
        let mut directories = vec![];
        for child in entries {
            let relative = paths::relative(root, &child)?;
            if remaining.remove(&relative) {
                ordered.push(relative);
            } else if is_real_directory(&child) && contains_files(&remaining, &relative) {
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
fn is_real_directory(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.is_dir() && !meta.file_type().is_symlink())
}
fn contains_files(files: &HashSet<String>, directory: &str) -> bool {
    let trimmed = directory.trim().trim_matches('/');
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
