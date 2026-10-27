//! Once collection starts, every failure belongs to this invocation; versions precede sources.
#[cfg(test)]
mod tests;
use super::{
    super::{bare::files, io_error::failure},
    Plan,
};
use std::{fs, io, path::Path};

impl Plan {
    pub(in crate::commands::gc) fn validate(&self, scope: &Path) -> io::Result<()> {
        let config = serde_json::from_slice(&fs::read(scope.join("scope.json"))?)?;
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
fn remove_file(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        result => result.map_err(|error| failure(error, "unlink", path)),
    }
}
fn remove_object(scope: &Path, hash: &str) -> io::Result<()> {
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    match fs::remove_file(&path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        result => result.map_err(|error| failure(error, "unlink", &path))?,
    }
    let parent = path.parent().unwrap();
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(failure(error, "scandir", parent)),
    };
    if entries
        .collect::<io::Result<Vec<_>>>()
        .map_err(|error| failure(error, "scandir", parent))?
        .is_empty()
    {
        match fs::remove_dir(parent) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            result => result.map_err(|error| failure(error, "rmdir", parent))?,
        }
    }
    Ok(())
}
