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
impl State {
    pub(crate) fn get(&self, directory: &Path, hash: [u8; 20]) -> Option<&Vec<u8>> {
        self.sources.get(&(directory.to_path_buf(), hash))
    }
    pub(crate) fn insert(&mut self, directory: &Path, hash: [u8; 20], body: Vec<u8>) {
        let weight = body.len();
        let key_weight = directory.as_os_str().len() + 20;
        if weight > MAX_BYTES || key_weight > 4 * 1024 * 1024 {
            return;
        }
        let key = (directory.to_path_buf(), hash);
        if let Some(previous) = self.sources.remove(&key) {
            self.bytes -= previous.len();
            self.key_bytes -= key_weight;
        }
        if self.bytes + weight > MAX_BYTES
            || self.key_bytes + key_weight > 4 * 1024 * 1024
            || self.sources.len() >= 4096
        {
            self.sources.clear();
            self.bytes = 0;
            self.key_bytes = 0;
        }
        self.sources.insert(key, body);
        self.bytes += weight;
        self.key_bytes += key_weight;
    }
}
