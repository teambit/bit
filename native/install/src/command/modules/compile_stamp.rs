//! Skipping the JavaScript `afterInstall` step when a repeat install changed nothing.
//!
//! `afterInstall` loads Harmony to compile the workspace and write its config files.
//! After a compilation without errors and a complete config write, a stamp records a
//! fingerprint of everything both read, and a snapshot of what they wrote: the dist
//! directories and the config files. The next install skips the step only when both
//! still match: the sources, the configuration, the installed packages and the output
//! are the ones the last run saw and produced, so running again would write the same files.
//! Outputs the install itself drops, the dist of injected package copies, are copied
//! back from an intact output with the same content (see [`check`]).
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

#[cfg(test)]
mod tests;

use crate::{
    dependencies::cache::hex,
    model::{Project, WorkspaceComponent},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
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
    /// Every file, symlink or missing path under `paths`, in walk order.
    outputs: Vec<Output>,
}

/// One output path. A file is identified by its content; its size and modification
/// time only spare reading it again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum Output {
    Missing { path: PathBuf },
    Link { path: PathBuf, target: PathBuf },
    File { path: PathBuf, size: u64, modified: u64, sha256: String },
}

impl Output {
    fn path(&self) -> &Path {
        match self {
            Self::Missing { path } | Self::Link { path, .. } | Self::File { path, .. } => path,
        }
    }
}

/// A file to put back before the step is skipped: `to` is gone or changed, and `from`
/// is an intact output with the bytes the compilation wrote to `to`.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct Restore {
    pub from: PathBuf,
    pub to: PathBuf,
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

/// The files to restore when the stamp at `stamp` matches the current inputs and every
/// output is intact or restorable; `None` when the step has to run.
///
/// The install engine re-syncs the injected copies of workspace packages
/// (`node_modules/.pnpm/<pkg>@file+<dir>`) from the component directory, which drops
/// their dist. Compiling writes the same bytes there again, so such a file is copied
/// back from an intact output with the same content, the package's own dist.
pub(super) fn check(stamp: &Path, inputs: &Inputs<'_>) -> io::Result<Option<Vec<Restore>>> {
    let Some(stored) = read(stamp) else { return Ok(None) };
    if stored.version != VERSION || stored.inputs != fingerprint(inputs)? {
        return Ok(None);
    }
    let Some(current) = current_outputs(&stored)? else { return Ok(None) };
    let Some(sorted) = sort_outputs(&stored.outputs, &current)? else { return Ok(None) };
    sorted.damaged
        .into_iter()
        .map(|(to, sha256)| {
            let from = sorted.intact.get(sha256)?;
            Some(Restore { from: from.to_path_buf(), to: to.to_path_buf() })
        })
        .collect::<Option<Vec<_>>>()
        .map_or(Ok(None), |restores| Ok(Some(restores)))
}

/// The outputs that exist now, by path; `None` when one of them was not recorded.
fn current_outputs(stored: &Stamp) -> io::Result<Option<HashMap<PathBuf, Output>>> {
    let current: HashMap<PathBuf, Output> = list_outputs(&stored.paths, false)?
        .into_iter()
        .filter(|output| !matches!(output, Output::Missing { .. }))
        .map(|output| (output.path().to_path_buf(), output))
        .collect();
    let recorded: HashSet<&Path> = stored.outputs
        .iter()
        .map(Output::path)
        .collect();
    let unrecorded = current
        .keys()
        .any(|path| !recorded.contains(path.as_path()));
    Ok((!unrecorded).then_some(current))
}

/// The recorded files that are intact (by content) and those that are not.
struct Sorted<'a> {
    intact: HashMap<&'a str, &'a Path>,
    damaged: Vec<(&'a Path, &'a str)>,
}

/// `None` when a recorded symlink changed or a recorded missing path now exists.
fn sort_outputs<'a>(
    outputs: &'a [Output],
    current: &HashMap<PathBuf, Output>,
) -> io::Result<Option<Sorted<'a>>> {
    let mut sorted = Sorted { intact: HashMap::new(), damaged: Vec::new() };
    for output in outputs {
        match output {
            Output::File { path, size, modified, sha256 } => {
                if is_intact(current.get(path), *size, *modified, sha256)? {
                    sorted.intact.entry(sha256.as_str()).or_insert(path.as_path());
                } else {
                    sorted.damaged.push((path.as_path(), sha256.as_str()));
                }
            }
            Output::Missing { path } if current.contains_key(path) => return Ok(None),
            Output::Link { path, .. } if current.get(path) != Some(output) => return Ok(None),
            Output::Missing { .. } | Output::Link { .. } => {}
        }
    }
    Ok(Some(sorted))
}

/// The current state of a stored file has its size, and its modification time or content.
fn is_intact(current: Option<&Output>, size: u64, modified: u64, sha256: &str) -> io::Result<bool> {
    let Some(Output::File {
        path,
        size: current_size,
        modified: current_modified,
        ..
    }) = current
    else {
        return Ok(false);
    };
    if *current_size != size {
        return Ok(false);
    }
    Ok(*current_modified == modified || file_sha256(path)? == sha256)
}

/// Copy each restored file back, creating its directory.
pub(super) fn restore(restores: &[Restore]) -> io::Result<()> {
    for Restore { from, to } in restores {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        if fs::symlink_metadata(to).is_ok() {
            fs::remove_file(to)?;
        }
        fs::copy(from, to)?;
    }
    Ok(())
}

/// Record the inputs and the outputs of a compilation without errors and a complete config write.
pub(super) fn write(stamp: &Path, inputs: &Inputs<'_>, paths: Vec<PathBuf>) -> io::Result<()> {
    let outputs = list_outputs(&paths, true)?;
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
    let bytes = fs::read(stamp).ok()?;
    serde_json::from_slice(&bytes)
        .ok()
        .or_else(|| {
            let value = crate::jsonc::parse(std::str::from_utf8(&bytes).ok()?).ok()?;
            serde_json::from_value(value).ok()
        })
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
                    let trimmed = spec.trim();
                    trimmed
                        .strip_prefix("link:")
                        .or_else(|| trimmed.strip_prefix("file:"))
                        .map(str::trim)
                        .filter(|target| !target.is_empty())
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
    hash_str(&mut hasher, inputs.bit_version.trim());
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

/// Every file, symlink and missing path under `paths`. File contents are hashed only
/// with `with_content`: a check hashes the files whose modification time moved.
fn list_outputs(paths: &[PathBuf], with_content: bool) -> io::Result<Vec<Output>> {
    let mut outputs = Vec::new();
    for path in paths {
        list_output(path, with_content, &mut outputs)?;
    }
    Ok(outputs)
}

fn list_output(path: &Path, with_content: bool, outputs: &mut Vec<Output>) -> io::Result<()> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            outputs.push(Output::Missing { path: path.to_path_buf() });
            return Ok(());
        }
        Err(error) => return Err(error),
    };
    if meta.file_type().is_symlink() {
        outputs.push(Output::Link { path: path.to_path_buf(), target: fs::read_link(path)? });
    } else if meta.is_dir() {
        list_dir(path, with_content, outputs)?;
    } else {
        let sha256 = if with_content { file_sha256(path)? } else { String::new() };
        outputs.push(Output::File {
            path: path.to_path_buf(),
            size: meta.len(),
            modified: modified_nanos(&meta)?,
            sha256,
        });
    }
    Ok(())
}

fn list_dir(dir: &Path, with_content: bool, outputs: &mut Vec<Output>) -> io::Result<()> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<io::Result<_>>()?;
    entries.sort();
    for entry in entries {
        list_output(&entry, with_content, outputs)?;
    }
    Ok(())
}

fn file_sha256(path: &Path) -> io::Result<String> {
    Ok(hex(&Sha256::digest(fs::read(path)?)))
}

/// Nanoseconds since the epoch; `u64` lasts until 2554.
fn modified_nanos(meta: &fs::Metadata) -> io::Result<u64> {
    let since_epoch = meta
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    Ok(u64::try_from(since_epoch.as_nanos()).unwrap_or(u64::MAX))
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
    hash_str(hasher, &format!("{}:{}", meta.len(), modified_nanos(meta)?));
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
