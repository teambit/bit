//! Bounded operation-local workspace file [`Observation`] and engine [`State`] tracking.

#[cfg(test)]
mod tests;

use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    sync::Arc,
};

/// Maximum total byte budget retained across operation-local file observations.
pub(crate) const MAX_BYTES: usize = 32 * 1024 * 1024;
/// Maximum number of file observations retained concurrently in [`State`].
const MAX_FILES: usize = 4096;
/// Maximum safe integer token value (`2^53 - 1`) for `JavaScript` interoperability.
const MAX_TOKEN: u64 = (1 << 53) - 1;

/// Operation-local observations, never a cache that silently replaces a later filesystem read.
#[derive(Default)]
pub(crate) struct State {
    pub(crate) command: super::engine::command::State,
    pub(crate) status: super::engine::client_status::State,
    pub(crate) inventory: super::engine::inventory::State,
    next: u64,
    bytes: usize,
    order: VecDeque<u64>,
    records: HashMap<u64, Observation>,
}

/// Operation-local file observation retaining [`PathBuf`], raw/snapshot hashes, and shared byte contents for [`State`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Observation {
    pub(crate) path: PathBuf,
    pub(crate) raw_hash: String,
    pub(crate) snapshot_hash: String,
    pub(crate) raw_bytes: usize,
    pub(crate) contents: Arc<[u8]>,
}

/// Returns `true` when `hash` is non-empty and free of ASCII or Unicode control characters.
#[inline]
fn valid_hash(hash: &str) -> bool {
    !hash.is_empty() && !hash.chars().any(char::is_control)
}

impl State {
    /// Retains `snapshot` under [`MAX_BYTES`] and [`MAX_FILES`], evicting oldest entries first.
    #[inline]
    pub(crate) fn retain(&mut self, snapshot: Observation) -> Option<u64> {
        let content_len = snapshot.contents.len();
        if content_len > MAX_BYTES
            || snapshot.raw_bytes < content_len
            || self.next >= MAX_TOKEN
            || snapshot.path.as_os_str().is_empty()
            || !valid_hash(snapshot.raw_hash.trim())
            || !valid_hash(snapshot.snapshot_hash.trim())
        {
            return None;
        }
        while self.bytes.saturating_add(content_len) > MAX_BYTES || self.records.len() >= MAX_FILES
        {
            let oldest = self.order.pop_front()?;
            let removed = self.records.remove(&oldest)?;
            self.bytes = self.bytes.saturating_sub(removed.contents.len());
        }
        self.next += 1;
        self.bytes = self.bytes.saturating_add(content_len);
        self.order.push_back(self.next);
        self.records.insert(self.next, snapshot);
        Some(self.next)
    }

    #[inline]
    pub(crate) fn get(&self, token: u64, path: &Path, raw_hash: &str) -> Option<&Observation> {
        let raw_hash = raw_hash.trim();
        if token == 0 || path.as_os_str().is_empty() || raw_hash.is_empty() {
            return None;
        }
        self.records
            .get(&token)
            .filter(|snapshot| {
                snapshot.path == path && snapshot.raw_hash.trim().eq_ignore_ascii_case(raw_hash)
            })
    }
}
