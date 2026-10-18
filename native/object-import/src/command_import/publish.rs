use super::{PreparedImport, capture::Object, invalid};
use crate::{mutable_store, store::Store};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::Value;
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

pub(super) fn object(hash: &str, kind: &str, value: Value) -> io::Result<Object> {
    let serialized = serialized(hash, kind, &value)?;
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&serialized)?;
    Ok(Object {
        kind: kind.to_owned(),
        bytes: encoder.finish()?,
        value: Some(value),
        source: None,
        inflated_size: serialized.len(),
    })
}
/// Reuse an immutable wire object only when its entire serialized representation is unchanged.
pub(super) fn reusing(
    hash: &str,
    kind: &str,
    value: Value,
    incoming: Option<Object>,
) -> io::Result<Object> {
    if let Some(incoming) = incoming {
        let raw = crate::checkout::repository::inflate(&incoming.bytes, 32 * 1024 * 1024)?;
        if incoming.kind == kind && raw == serialized(hash, kind, &value)? {
            return Ok(incoming);
        }
    }
    object(hash, kind, value)
}
fn serialized(hash: &str, kind: &str, value: &Value) -> io::Result<Vec<u8>> {
    crate::merge_history::hash(hash)?;
    let text = serde_json::to_string(value).map_err(io::Error::other)?;
    let mut bytes = format!("{kind} {hash} {}\0", text.encode_utf16().count()).into_bytes();
    bytes.extend_from_slice(text.as_bytes());
    Ok(bytes)
}
impl PreparedImport {
    pub(crate) fn commit(&self) -> io::Result<()> {
        self.validate()?;
        if !self.writes.lane_histories.is_empty() {
            return Err(invalid("import LaneHistory scalar receipts pending"));
        }
        // File-remote fetching populates history on that remote before exposing
        // its stream. Keep those writes ahead of corresponding local imports.
        self.publish_remote_history()?;
        let store = Store::new(self.environment.local_directory.clone(), None)?;
        for kind in
            ["Source", "ScopeMeta", "Version", "VersionHistory", "Component", "Lane", "LaneHistory"]
        {
            for (hash, record) in &self.overlay.objects {
                if record.kind == kind {
                    store.write(hash, &record.bytes)?;
                }
            }
            store.finish_batch()?;
        }
        if self.writes.index_changed {
            let mut bytes =
                serde_json::to_vec_pretty(&self.writes.index).map_err(io::Error::other)?;
            bytes.push(b'\n');
            store.write_index(&bytes)?;
        }
        if let Some(bytes) = &self.writes.switch_tracking {
            let scope = self.environment.local_directory
                .parent()
                .ok_or_else(|| invalid("switch scope directory"))?;
            write_file(&scope.join("scope.json"), bytes)?;
        }
        self.publish_refs()?;
        if let Some(path) = &self.environment.global_remotes {
            write_file(path, b"{}")?;
        }
        Ok(())
    }
    fn publish_refs(&self) -> io::Result<()> {
        let scope = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("import local scope"))?;
        for (remote, rows) in &self.overlay.remote_refs {
            write_file(
                &scope
                    .join("refs/remotes")
                    .join(remote)
                    .join("main"),
                &serde_json::to_vec_pretty(rows).map_err(io::Error::other)?,
            )?;
        }
        for ((remote, lane), rows) in &self.overlay.lane_refs {
            write_file(
                &scope
                    .join("refs/remotes")
                    .join(remote)
                    .join(lane),
                &serde_json::to_vec_pretty(rows).map_err(io::Error::other)?,
            )?;
        }
        Ok(())
    }
    fn publish_remote_history(&self) -> io::Result<()> {
        for (directory, hash, value) in &self.writes.remote_objects {
            if self.environment.remote_overrides
                .values()
                .any(|path| directory == &path.join("objects"))
            {
                // An HTTP remote is a retained in-memory stream, not a writable
                // scope. Its merged history is already staged for local commit.
                continue;
            }
            let store = Store::new(directory.clone(), None)?;
            mutable_store::persist_serialized(
                &store,
                hash,
                &serialized(hash, "VersionHistory", value)?,
                false,
            )?;
            store.finish_batch()?;
        }
        Ok(())
    }
}
fn write_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| invalid("import publication parent"))?;
    fs::create_dir_all(parent)?;
    // Canonical outputFile preserves the existing inode and its owner/ACLs.
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests;
