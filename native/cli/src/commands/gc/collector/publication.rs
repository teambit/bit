//! Once collection starts, every failure belongs to this invocation; versions precede sources.
//!
//! Publishes the [`Plan`] filesystem moves ([`files`]) and deletions after preflight validation succeeds.
#[cfg(test)]
mod tests;
use super::{
    super::{bare::files, io_error::failure},
    Plan,
};
use std::{fs, io, path::Path};

impl Plan {
    /// Validates batch limits and preflights backup moves before any filesystem mutation occurs.
    pub(in crate::commands::gc) fn validate(&self, scope: &Path) -> io::Result<()> {
        if self.result.deleted.by_type.len() > 1 {
            return Err(io::Error::other(
                "mixed object-type collection report ordering requires the published runtime",
            ));
        }
        let config = match fs::read(scope.join("scope.json")) {
            Ok(bytes) => bit_object_import::parse_jsonc(&bytes)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => serde_json::Value::Null,
            Err(error) => return Err(error),
        };
        files::validate_batch(&config, self.versions.len().max(self.sources.len()))?;
        if self.result.flags.backup {
            files::preflight_moves(scope, &self.versions)?;
            files::preflight_moves(scope, &self.sources)?;
        }
        if self.stray.len() > 256 {
            return Err(io::Error::other("stray-file concurrency limit"));
        }
        Ok(())
    }
    /// Logs each deleted `Version` and `Source` hash to `output` when `--verbose` is active.
    #[inline]
    pub(in crate::commands::gc) fn log(&self, output: &bit_install::output::Output) {
        for (kind, hashes) in [("Version", &self.versions), ("Source", &self.sources)] {
            for hash in hashes {
                output.console(&format!("gc, deleting {kind} {}", hash.trim()));
            }
        }
    }
    /// Executes stray-file deletion and object backup/removal for `self` unless `dry_run` is set.
    #[inline]
    pub(in crate::commands::gc) fn execute(&self, scope: &Path) -> io::Result<()> {
        if self.result.flags.dry_run {
            return Ok(());
        }
        files::batch(&self.stray, |path| remove_file(path))?;
        for hashes in [&self.versions, &self.sources] {
            if self.result.flags.backup {
                files::move_batch(scope, hashes)?;
            } else {
                files::batch(hashes, |hash| remove_object(scope, hash))?;
            }
        }
        Ok(())
    }
}
#[inline]
fn remove_file(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        result => result.map_err(|error| failure(error, "unlink", path)),
    }
}
fn remove_object(scope: &Path, hash: &str) -> io::Result<()> {
    let trimmed = hash.trim();
    if trimmed.len() != 40
        || !trimmed
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(io::Error::other("gc invalid object hash"));
    }
    let path = scope
        .join("objects")
        .join(&trimmed[..2])
        .join(&trimmed[2..]);
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(failure(error, "unlink", &path)),
    }
    if let Some(parent) = path.parent() {
        remove_empty_bucket(parent)?;
    }
    Ok(())
}
#[inline]
fn remove_empty_bucket(parent: &Path) -> io::Result<()> {
    let mut entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(failure(error, "scandir", parent)),
    };
    if entries
        .next()
        .transpose()
        .map_err(|error| failure(error, "scandir", parent))?
        .is_some()
    {
        return Ok(());
    }
    match fs::remove_dir(parent) {
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::DirectoryNotEmpty,
            ) => {}
        result => result.map_err(|error| failure(error, "rmdir", parent))?,
    }
    Ok(())
}
