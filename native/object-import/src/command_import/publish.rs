//! Zlib-compressed loose [`Object`] encoding ([`object`]) and atomic scope publication for [`PreparedImport`].

#[cfg(test)]
mod tests;

use super::{PreparedImport, capture::Object, invalid};
use crate::{mutable_store, store::Store};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::Value;
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

/// Encodes a parsed scope object `value` into a zlib-compressed loose [`Object`].
#[inline]
pub(super) fn object(hash: &str, kind: &str, value: Value) -> io::Result<Object> {
    let kind = kind.trim();
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
#[inline]
pub(super) fn reusing(
    hash: &str,
    kind: &str,
    value: Value,
    incoming: Option<Object>,
) -> io::Result<Object> {
    reusing_candidates(hash, kind, value, incoming)
}
/// Reuse the first candidate [`Object`] whose inflated bytes match `value`, or encode a new loose [`Object`].
pub(super) fn reusing_candidates(
    hash: &str,
    kind: &str,
    value: Value,
    candidates: impl IntoIterator<Item = Object>,
) -> io::Result<Object> {
    let kind = kind.trim();
    let expected = serialized(hash, kind, &value)?;
    for incoming in candidates {
        let raw = crate::checkout::repository::inflate(&incoming.bytes, 32 * 1024 * 1024)?;
        if incoming.kind.trim() == kind && raw == expected {
            return Ok(incoming);
        }
    }
    object(hash, kind, value)
}

/// Serialize a scope object header (`"<kind> <hash> <utf16_len>\0"`) followed by its JSON [`Value`] body.
#[inline]
fn serialized(hash: &str, kind: &str, value: &Value) -> io::Result<Vec<u8>> {
    let hash = hash.trim();
    let kind = kind.trim();
    crate::merge_history::hash(hash)?;
    let text = serde_json::to_string(value).map_err(io::Error::other)?;
    let utf16_len = if text.is_ascii() { text.len() } else { text.encode_utf16().count() };
    let mut bytes = Vec::with_capacity(kind.len() + hash.len() + 24 + text.len());
    write!(&mut bytes, "{kind} {hash} {utf16_len}\0")?;
    bytes.extend_from_slice(text.as_bytes());
    Ok(bytes)
}
impl PreparedImport {
    /// Validate and atomically commit all staged scope objects, index rows, and remote refs.
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
                if record.kind.trim() == kind {
                    store.write(hash.trim(), &record.bytes)?;
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
    /// Write all staged remote `main` and lane reference files under `.bit/refs/remotes`.
    fn publish_refs(&self) -> io::Result<()> {
        let remotes_dir = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("import local scope"))?
            .join("refs/remotes");
        for (remote, rows) in &self.overlay.remote_refs {
            write_file(
                &remotes_dir.join(remote.trim()).join("main"),
                &serde_json::to_vec_pretty(rows).map_err(io::Error::other)?,
            )?;
        }
        for ((remote, lane), rows) in &self.overlay.lane_refs {
            write_file(
                &remotes_dir.join(remote.trim()).join(lane.trim()),
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
pub(super) fn write_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| invalid("import publication parent"))?;
    if !parent.as_os_str().is_empty() {
        fs::create_dir_all(parent)?;
    }
    // Canonical outputFile preserves the inode and owner/ACLs without a disk flush.
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)?;
    file.write_all(bytes)
}
