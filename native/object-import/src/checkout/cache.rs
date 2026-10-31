#[cfg(test)]
mod tests;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use super::MAX_BYTES;

/// One helper owns one bounded set of verified Source snapshots. Keys and empty
/// sources count toward separate metadata/entry limits too, preventing unbounded
/// metadata-only growth without shrinking the 32 MiB raw Source budget.
#[derive(Default)]
pub(crate) struct State {
    sources: HashMap<(PathBuf, [u8; 20]), Vec<u8>>,
    bytes: usize,
    key_bytes: usize,
}
const MAX_KEY_BYTES: usize = 4 * 1024 * 1024;
const MAX_ENTRIES: usize = 4096;

fn canonical_dir(directory: &Path) -> PathBuf {
    directory.components().collect()
}

impl State {
    pub(crate) fn get(&self, directory: &Path, hash: [u8; 20]) -> Option<&Vec<u8>> {
        self.sources.get(&(canonical_dir(directory), hash))
    }
    pub(crate) fn insert(&mut self, directory: &Path, hash: [u8; 20], body: Vec<u8>) {
        let dir = canonical_dir(directory);
        let weight = body.len();
        let key_weight = dir.as_os_str().len().saturating_add(20);
        let key = (dir, hash);
        if let Some(previous) = self.sources.remove(&key) {
            self.bytes = self.bytes.saturating_sub(previous.len());
            self.key_bytes = self.key_bytes.saturating_sub(key_weight);
        }
        if weight > MAX_BYTES || key_weight > MAX_KEY_BYTES {
            return;
        }
        if self.bytes.saturating_add(weight) > MAX_BYTES
            || self.key_bytes.saturating_add(key_weight) > MAX_KEY_BYTES
            || self.sources.len() >= MAX_ENTRIES
        {
            self.sources.clear();
            self.bytes = 0;
            self.key_bytes = 0;
        }
        self.sources.insert(key, body);
        self.bytes = self.bytes.saturating_add(weight);
        self.key_bytes = self.key_bytes.saturating_add(key_weight);
    }
}
