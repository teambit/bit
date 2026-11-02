//! `globby` breadth-first traversal ([`captured`], [`files`]), retaining Windows filesystem enumeration order.
//!
//! Ensures workspace file diff ordering matches Node.js `globby` output across platforms.

use crate::commands::status::js::decline;
use std::{
    collections::{HashSet, VecDeque},
    fs, io,
    path::{Path, PathBuf},
};

/// Physical sources retain globby order; callback-created virtual files retain manifest order.
pub(in crate::commands) fn captured(
    root: &Path,
    files: &[String],
    overlays: Option<&serde_json::Value>,
) -> io::Result<Vec<String>> {
    let (mut physical, virtual_files): (Vec<_>, Vec<_>) = files
        .iter()
        .cloned()
        .partition(|file| {
            let trimmed = file.trim();
            overlays.is_none_or(|overlays| {
                overlays
                    .get(file)
                    .or_else(|| overlays.get(trimmed))
                    .is_none()
            }) || root.join(trimmed).is_file()
        });
    if cfg!(windows) {
        physical = filesystem(root, &physical)?;
    } else {
        physical.sort_by(|left, right| walk_order(left, right));
    }
    physical.extend(virtual_files);
    Ok(physical)
}

/// Reorders `files` by breadth-first directory enumeration under `root` to match Windows `globby` order.
pub(super) fn filesystem(root: &Path, files: &[String]) -> io::Result<Vec<String>> {
    if files.is_empty() {
        return Ok(Vec::new());
    }
    let normalized: Vec<String> = files
        .iter()
        .map(|file| file.trim().replace('\\', "/"))
        .collect();
    let mut remaining: HashSet<&str> = normalized
        .iter()
        .map(String::as_str)
        .collect();
    let parents: HashSet<PathBuf> = normalized
        .iter()
        .flat_map(|file| {
            Path::new(file)
                .ancestors()
                .skip(1)
                .map(Path::to_path_buf)
        })
        .collect();
    let mut pending = VecDeque::from([PathBuf::new()]);
    let mut ordered = Vec::with_capacity(files.len());
    while let Some(directory) = pending.pop_front() {
        let (directories, paths) = enumerate(root, &directory, &parents)?;
        pending.extend(directories);
        ordered.extend(
            paths
                .into_iter()
                .filter(|path| remaining.remove(path.as_str())),
        );
    }
    if !remaining.is_empty() {
        return Err(decline("diff source enumeration changed"));
    }
    Ok(ordered)
}

/// Lists direct child directories (matching `parents`) and regular files under `root.join(directory)`.
fn enumerate(
    root: &Path,
    directory: &Path,
    parents: &HashSet<PathBuf>,
) -> io::Result<(Vec<PathBuf>, Vec<String>)> {
    let mut directories = Vec::new();
    let mut paths = Vec::new();
    for entry in fs::read_dir(root.join(directory))? {
        let entry = entry?;
        let relative = directory.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() && parents.contains(&relative) {
            directories.push(relative);
        } else if kind.is_file() {
            let normalized = relative
                .to_str()
                .ok_or_else(|| decline("diff non-UTF8 filename"))?
                .replace('\\', "/");
            if !normalized.is_empty() {
                paths.push(normalized);
            }
        }
    }
    Ok((directories, paths))
}

/// `globby`'s order: directories breadth first, each directory's entries in
/// byte order, as libuv's `scandir` sorts them. A file's position is its
/// directory's depth, then its directory's path, then its name.
#[inline]
pub(super) fn walk_order(left: &str, right: &str) -> std::cmp::Ordering {
    let (left_dirs, left_name) = split_walk_segments(left);
    let (right_dirs, right_name) = split_walk_segments(right);
    left_dirs
        .len()
        .cmp(&right_dirs.len())
        .then_with(|| left_dirs.cmp(&right_dirs))
        .then_with(|| left_name.cmp(right_name))
}

#[inline]
fn split_walk_segments(path: &str) -> (Vec<&str>, &str) {
    let mut parts: Vec<&str> = path
        .trim()
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect();
    let name = parts.pop().unwrap_or_default();
    (parts, name)
}
