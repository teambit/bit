//! Remove `node_modules/.pnpm` directories the current lockfile no longer
//! lists (`pnpm-prune-modules.ts`), preserving directories loaded by the host.
//!
//! Compares materialized `.pnpm` virtual-store entries against `node_modules/.pnpm/lock.yaml` snapshots ([`Lockfile`]) via [`prune_modules`].

#[cfg(test)]
mod tests;

use super::{VIRTUAL_STORE_DIR_MAX_LENGTH, error::diagnostic};
use pnpm_lockfile::Lockfile;
use std::{collections::HashSet, fs, io, path::Path};

/// Prune the project-local virtual store of the workspace at `root`. `keep`
/// names virtual-store directories the running process has loaded modules
/// from; those are never removed.
pub fn prune_modules(root: &Path, keep: &HashSet<String>) -> io::Result<()> {
    let virtual_store_dir = root.join("node_modules").join(".pnpm");
    let package_dirs = read_package_dirs(&virtual_store_dir)?;
    if package_dirs.is_empty() {
        return Ok(());
    }
    // No current lockfile means nothing is known about what was materialized,
    // not that nothing belongs here.
    let current = virtual_store_dir.join(Lockfile::CURRENT_FILE_NAME);
    let Some(lockfile) = Lockfile::load_from_path(&current).map_err(|error| diagnostic(&error))?
    else {
        return Ok(());
    };
    // Directory names come from the peer-suffixed `snapshots` keys.
    let expected: HashSet<String> = lockfile.snapshots
        .iter()
        .flatten()
        .map(|(key, _)| key.to_virtual_store_name(VIRTUAL_STORE_DIR_MAX_LENGTH))
        .collect();
    for dir in package_dirs {
        let trimmed = dir.trim();
        if !trimmed.is_empty() && !expected.contains(trimmed) && !keep.contains(trimmed) {
            remove(&virtual_store_dir.join(&dir))?;
        }
    }
    Ok(())
}

/// Remove a directory tree, file, or symlink at `path` (`fs.remove`) for [`prune_modules`], ignoring [`io::ErrorKind::NotFound`].
#[inline]
fn remove(path: &Path) -> io::Result<()> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let result = if meta.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
    match result {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

/// The package directories of the virtual store. With the global virtual
/// store only `lock.yaml` and the hoisted `node_modules` live here; a
/// lockfile-only install leaves no directory at all.
#[inline]
fn read_package_dirs(virtual_store_dir: &Path) -> io::Result<Vec<String>> {
    let entries = match fs::read_dir(virtual_store_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut dirs = Vec::new();
    for entry in entries {
        let name = match entry?.file_name().into_string() {
            Ok(name) => name,
            Err(os) => os.to_string_lossy().into_owned(),
        };
        if !matches!(name.as_str(), Lockfile::CURRENT_FILE_NAME | "node_modules") {
            dirs.push(name);
        }
    }
    Ok(dirs)
}
