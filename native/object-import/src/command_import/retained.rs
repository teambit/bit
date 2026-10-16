//! Revalidate exact import-owned writes before retaining a post-publication command phase.

#[cfg(test)]
mod tests;
use super::{PreparedImport, invalid, publish};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
};

impl PreparedImport {
    pub(crate) fn commit_retained(&mut self) -> io::Result<HashMap<PathBuf, Vec<u8>>> {
        let files = self.publication_files()?;
        self.commit()?;
        self.capture.accept_published(&files)?;
        Ok(files)
    }
    pub(crate) fn accept_published(&mut self, files: &HashMap<PathBuf, Vec<u8>>) -> io::Result<()> {
        self.capture.accept_published(files)
    }
    fn publication_files(&self) -> io::Result<HashMap<PathBuf, Vec<u8>>> {
        let mut files = HashMap::new();
        for (hash, object) in &self.overlay.objects {
            files.insert(
                object_path(&self.environment.local_directory, hash),
                object.bytes.clone(),
            );
        }
        for (directory, hash, value) in &self.writes.remote_objects {
            if self.environment.remote_overrides
                .values()
                .any(|path| directory == &path.join("objects"))
            {
                continue;
            }
            files.insert(
                object_path(directory, hash),
                publish::object(hash, "VersionHistory", value.clone())?.bytes,
            );
        }
        self.metadata_files(&mut files)?;

        Ok(files)
    }
    fn metadata_files(&self, files: &mut HashMap<PathBuf, Vec<u8>>) -> io::Result<()> {
        let scope = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("retained import scope"))?;
        if self.writes.index_changed {
            files.insert(scope.join("index.json"), pretty(&self.writes.index, true)?);
        }
        if let Some(bytes) = &self.writes.switch_tracking {
            files.insert(scope.join("scope.json"), bytes.clone());
        }
        for (remote, rows) in &self.overlay.remote_refs {
            files.insert(
                scope
                    .join("refs/remotes")
                    .join(remote)
                    .join("main"),
                pretty(rows, false)?,
            );
        }
        for ((remote, lane), rows) in &self.overlay.lane_refs {
            files.insert(
                scope
                    .join("refs/remotes")
                    .join(remote)
                    .join(lane),
                pretty(rows, false)?,
            );
        }
        if let Some(path) = &self.environment.global_remotes {
            files.insert(path.clone(), b"{}".to_vec());
        }
        Ok(())
    }
}
impl super::capture::Capture {
    pub(super) fn accept_published(&mut self, files: &HashMap<PathBuf, Vec<u8>>) -> io::Result<()> {
        for (path, bytes) in files {
            if fs::read(path)? != *bytes {
                return Err(invalid("retained import publication changed"));
            }
            self.accept_known(path, bytes);
        }
        self.validate()
    }
}
fn object_path(directory: &Path, hash: &str) -> PathBuf {
    directory
        .join(&hash[..2])
        .join(&hash[2..])
}
fn pretty(value: &Value, newline: bool) -> io::Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(io::Error::other)?;
    if newline {
        bytes.push(b'\n');
    }
    Ok(bytes)
}
