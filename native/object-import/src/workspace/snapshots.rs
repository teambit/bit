#[cfg(test)]
mod tests;

use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    sync::Arc,
};

pub(crate) const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_FILES: usize = 4096;
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

#[derive(Clone)]
pub(crate) struct Observation {
    pub(crate) path: PathBuf,
    pub(crate) raw_hash: String,
    pub(crate) snapshot_hash: String,
    pub(crate) raw_bytes: usize,
    pub(crate) contents: Arc<[u8]>,
}

impl State {
    pub(crate) fn retain(&mut self, snapshot: Observation) -> Option<u64> {
        if snapshot.contents.len() > MAX_BYTES
            || self.next >= MAX_TOKEN
            || snapshot.path.as_os_str().is_empty()
            || snapshot.raw_hash.trim().is_empty()
        {
            return None;
        }
        while self.bytes.saturating_add(snapshot.contents.len()) > MAX_BYTES
            || self.records.len() >= MAX_FILES
        {
            let oldest = self.order.pop_front()?;
            let removed = self.records.remove(&oldest)?;
            self.bytes = self.bytes.saturating_sub(removed.contents.len());
        }
        self.next += 1;
        self.bytes = self.bytes.saturating_add(snapshot.contents.len());
        self.order.push_back(self.next);
        self.records.insert(self.next, snapshot);
        Some(self.next)
    }

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
