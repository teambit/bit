//! Bit's `bit:` block of `pnpm-lock.yaml` (`{ depsRequiringBuild, restoredFromModel? }`)
//! and the `--update` lockfile removal and rollback.
//!
//! The engine rewrites `pnpm-lock.yaml` from its typed model; top-level keys it
//! does not define round-trip through [`Lockfile::extra`], so the block is read
//! before the install and re-asserted after it.
//! Synchronizes `bit:` metadata ([`BIT_KEY`]) across both the root `pnpm-lock.yaml` and `.pnpm/lock.yaml`.

#[cfg(test)]
mod tests;

use super::error::diagnostic;
use pnpm_lockfile::{Lockfile, SymlinkedLockfile};
use serde_json::{Map, Value};
use std::{fs, io, path::Path};

/// Top-level `bit` key in `pnpm-lock.yaml` storing `depsRequiringBuild` and `restoredFromModel`.
const BIT_KEY: &str = "bit";

/// The `bit:` block of the wanted lockfile at `root`, if any. A malformed lockfile fails
/// the install itself later with a proper error.
#[inline]
pub(super) fn read(root: &Path) -> Option<Map<String, Value>> {
    let lockfile = Lockfile::load_from_path(&root.join(Lockfile::FILE_NAME)).ok().flatten()?;
    lockfile.extra
        .get(BIT_KEY)
        .and_then(Value::as_object)
        .cloned()
}

/// The attributes to re-assert after an install (`mergeBitLockfileAttrs`):
/// an uncomputed `depsRequiringBuild` leaves the recorded list untouched.
pub(super) fn merge(
    pre_install: Option<Map<String, Value>>,
    deps_requiring_build: Option<&[String]>,
) -> Option<Map<String, Value>> {
    let Some(deps) = deps_requiring_build else { return pre_install };
    let mut attrs = pre_install.unwrap_or_default();
    let mut cleaned = Vec::with_capacity(deps.len());
    for dep in deps
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .filter(|dep| !dep.is_empty())
    {
        if !cleaned
            .iter()
            .any(|existing| existing == dep)
        {
            cleaned.push(dep.to_owned());
        }
    }
    attrs.insert("depsRequiringBuild".to_string(), Value::from(cleaned));
    Some(attrs)
}

/// Merge `attrs` over the lockfile's `bit:` block, writing only on change
/// (`addBitAttributesToLockfile`).
pub(super) fn write(root: &Path, attrs: Map<String, Value>) -> io::Result<()> {
    let path = root.join(Lockfile::FILE_NAME);
    let Some(mut lockfile) = Lockfile::load_from_path(&path).map_err(|error| diagnostic(&error))?
    else {
        return Ok(());
    };
    let current = lockfile.extra.get(BIT_KEY).and_then(Value::as_object);
    let mut merged = current.cloned().unwrap_or_default();
    merged.extend(attrs);
    if current == Some(&merged) {
        return Ok(());
    }
    lockfile.extra.insert(BIT_KEY.to_string(), Value::Object(merged));
    lockfile.save_to_path(&path, SymlinkedLockfile::Refuse).map_err(|error| diagnostic(&error))
}

/// `--update` resolves everything again, so the wanted lockfile is removed
/// first. Returns its bytes, to restore it when the install fails.
pub(super) fn remove_for_update(root: &Path, update_all: bool) -> io::Result<Option<Vec<u8>>> {
    if !update_all {
        return Ok(None);
    }
    let path = root.join(Lockfile::FILE_NAME);
    let contents = match fs::read(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    Ok(Some(contents))
}

/// Restore a `pnpm-lock.yaml` file that [`remove_for_update`] removed before a failed install.
#[inline]
pub(super) fn restore_after_failure(root: &Path, contents: Option<Vec<u8>>) -> io::Result<()> {
    if let Some(contents) = contents {
        fs::write(root.join(Lockfile::FILE_NAME), contents)?;
    }
    Ok(())
}
