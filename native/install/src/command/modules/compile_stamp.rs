//! Skipping the JavaScript `afterInstall` step when a repeat install changed nothing.
//!
//! `afterInstall` loads Harmony to compile the workspace and write its config files.
//! After a compilation without errors and a complete config write, a stamp records a
//! fingerprint of everything both read, and a snapshot of what they wrote: the dist
//! directories and the config files. The next install skips the step only when both
//! still match: the sources, the configuration, the installed packages and the output
//! are the ones the last run saw and produced, so running again would write the same files.
//!
//! The fingerprint covers:
//! - the bit version (core envs and their compilers ship with bit);
//! - `workspace.jsonc`, `.bitmap` and `pnpm-lock.yaml` (configuration, envs and the
//!   installed packages);
//! - every file under each component directory except `node_modules`, by size and
//!   modification time: the component loader also picks up files `.bitmap` does not list.
//!
//! Packages linked from outside the workspace (`link:`/`file:` dependencies) can change
//! without any of these changing, so a workspace with such a dependency is never skipped.

use crate::{
    dependencies::cache::hex,
    model::{Project, WorkspaceComponent},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// Bumped whenever the fingerprint or the snapshot changes shape.
const VERSION: u32 = 1;

/// The manifest fields whose `link:`/`file:` values are checked.
const DEPENDENCY_FIELDS: [&str; 4] =
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stamp {
    version: u32,
    inputs: String,
    /// The dist directories and config files.
    paths: Vec<PathBuf>,
    outputs: String,
}

/// What the fingerprint is computed from.
pub(super) struct Inputs<'a> {
    pub root: &'a Path,
    pub bit_version: &'a str,
    pub components: &'a [WorkspaceComponent],
}

/// `<scope>/cache/native-install/after-install.json`.
pub(super) fn path(scope_path: &Path) -> PathBuf {
    scope_path.join("cache/native-install/after-install.json")
}

/// The stamp at `stamp` matches the current inputs and dist directories.
pub(super) fn is_fresh(stamp: &Path, inputs: &Inputs<'_>) -> io::Result<bool> {
    let Some(stored) = read(stamp) else { return Ok(false) };
    if stored.version != VERSION || stored.inputs != fingerprint(inputs)? {
        return Ok(false);
    }
    Ok(stored.outputs == snapshot(&stored.paths)?)
}

/// Record the inputs and the outputs of a compilation without errors and a complete config write.
pub(super) fn write(stamp: &Path, inputs: &Inputs<'_>, paths: Vec<PathBuf>) -> io::Result<()> {
    let outputs = snapshot(&paths)?;
    let stamp_value = Stamp { version: VERSION, inputs: fingerprint(inputs)?, paths, outputs };
    if let Some(parent) = stamp.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(stamp, serde_json::to_vec(&stamp_value).map_err(io::Error::other)?)
}

/// Forget the last compilation; a missing stamp is fine.
pub(super) fn remove(stamp: &Path) {
    let _ = fs::remove_file(stamp);
}

fn read(stamp: &Path) -> Option<Stamp> {
    serde_json::from_slice(&fs::read(stamp).ok()?).ok()
}

/// A `link:` or `file:` dependency of any project that resolves outside the workspace's
/// components, its `node_modules` and the directories bit links its core aspects from.
pub(super) fn has_external_links(
    projects: &[Project],
    components: &[WorkspaceComponent],
    root: &Path,
    bit_dirs: &[PathBuf],
) -> bool {
    let node_modules = root.join("node_modules");
    let allowed = |target: &Path| {
        target.starts_with(&node_modules)
            || components
                .iter()
                .any(|component| target.starts_with(&component.dir))
            || bit_dirs
                .iter()
                .any(|dir| target.starts_with(dir))
    };
    projects
        .iter()
        .any(|project| {
            DEPENDENCY_FIELDS
                .iter()
                .filter_map(|field| project.manifest.get(*field).and_then(Value::as_object))
                .flat_map(|dependencies| dependencies.values().filter_map(Value::as_str))
                .filter_map(|spec| {
                    spec.strip_prefix("link:")
                        .or_else(|| spec.strip_prefix("file:"))
                })
                .any(|target| !allowed(&normalize(&project.dir.join(target))))
        })
}

/// `path.resolve` without touching the filesystem: `.` and `..` segments are folded.
fn normalize(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other),
        }
    }
    normalized
}

fn fingerprint(inputs: &Inputs<'_>) -> io::Result<String> {
    let mut hasher = Sha256::new();
    hash_str(&mut hasher, &format!("bit-native-after-install/{VERSION}"));
    hash_str(&mut hasher, inputs.bit_version);
    for file in ["workspace.jsonc", ".bitmap", "pnpm-lock.yaml"] {
        hash_str(&mut hasher, file);
        match fs::read(inputs.root.join(file)) {
            Ok(content) => hash_bytes(&mut hasher, &content),
            Err(error) if error.kind() == io::ErrorKind::NotFound => hash_str(&mut hasher, "-"),
            Err(error) => return Err(error),
        }
    }
    let mut components: Vec<&WorkspaceComponent> = inputs.components.iter().collect();
    components.sort_by(|a, b| a.root_dir.cmp(&b.root_dir));
    for component in components {
        hash_str(&mut hasher, &component.root_dir);
        hash_tree(&mut hasher, &component.dir, &component.dir, true)?;
    }
    Ok(hex(&hasher.finalize()))
}

/// Each output path: a directory's tree, a file's size and modification time, or a
/// symlink's target. A missing path hashes as such.
fn snapshot(paths: &[PathBuf]) -> io::Result<String> {
    let mut hasher = Sha256::new();
    for path in paths {
        hash_str(&mut hasher, &path.to_string_lossy());
        match fs::symlink_metadata(path) {
            Ok(meta) if meta.is_dir() => hash_tree(&mut hasher, path, path, false)?,
            Ok(meta) => hash_entry(&mut hasher, path, &meta)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                hash_str(&mut hasher, "missing");
            }
            Err(error) => return Err(error),
        }
    }
    Ok(hex(&hasher.finalize()))
}

/// Every entry under `dir` in name order: its relative path, then a symlink's target or a
/// file's size and modification time. A missing directory hashes as such.
fn hash_tree(
    hasher: &mut Sha256,
    base: &Path,
    dir: &Path,
    skip_node_modules: bool,
) -> io::Result<()> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            hash_str(hasher, "missing");
            return Ok(());
        }
        Err(error) => return Err(error),
    };
    let mut entries: Vec<fs::DirEntry> = entries.collect::<io::Result<_>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);
    for entry in entries {
        if skip_node_modules && entry.file_name() == "node_modules" {
            continue;
        }
        let path = entry.path();
        let relative = path.strip_prefix(base).unwrap_or(&path);
        hash_str(hasher, &relative.to_string_lossy());
        let meta = fs::symlink_metadata(&path)?;
        if meta.is_dir() {
            hash_tree(hasher, base, &path, skip_node_modules)?;
        } else {
            hash_entry(hasher, &path, &meta)?;
        }
    }
    Ok(())
}

/// A symlink's target, or a file's size and modification time.
fn hash_entry(hasher: &mut Sha256, path: &Path, meta: &fs::Metadata) -> io::Result<()> {
    if meta.file_type().is_symlink() {
        hash_str(hasher, &fs::read_link(path)?.to_string_lossy());
        return Ok(());
    }
    let modified = meta
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_or(0, |time| time.as_nanos());
    hash_str(hasher, &format!("{}:{modified}", meta.len()));
    Ok(())
}

/// Length-prefixed, so adjacent values cannot run together.
fn hash_str(hasher: &mut Sha256, value: &str) {
    hash_bytes(hasher, value.as_bytes());
}

fn hash_bytes(hasher: &mut Sha256, value: &[u8]) {
    hasher.update((value.len() as u64).to_le_bytes());
    hasher.update(value);
}

#[cfg(test)]
mod tests;
