//! Bound all live queued and completed paths ([`Queue`]) before allocating their clones.

use super::invalid;
use std::{collections::VecDeque, io};

const MAX_NODES: usize = 262_144;
const MAX_BYTES: usize = 32 * 1024 * 1024;

/// Bounded breadth-first path queue enforcing node and byte budgets during dependent traversal.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Queue {
    paths: VecDeque<Vec<String>>,
    nodes: usize,
    bytes: usize,
}
impl Queue {
    pub(super) fn from_sources(sources: &[String]) -> io::Result<Self> {
        let mut queue = Self { paths: VecDeque::with_capacity(sources.len()), nodes: 0, bytes: 0 };
        for id in sources {
            queue.push(&[], id)?;
        }
        Ok(queue)
    }
    pub(super) fn push(&mut self, path: &[String], id: &str) -> io::Result<()> {
        let id = id.trim();
        if id.is_empty() || path.len() >= 4096 || id.contains(char::is_control) {
            return Err(invalid("inbound dependent path"));
        }
        let nodes = self.nodes
            .checked_add(path.len())
            .and_then(|nodes| nodes.checked_add(1));
        let bytes = path
            .iter()
            .try_fold(id.len(), |bytes, id| bytes.checked_add(id.len()))
            .and_then(|bytes| self.bytes.checked_add(bytes));
        let (Some(nodes), Some(bytes)) = (nodes, bytes) else {
            return Err(invalid("inbound dependent graph path payload limit"));
        };
        if nodes > MAX_NODES || bytes > MAX_BYTES {
            return Err(invalid("inbound dependent graph path payload limit"));
        }
        self.nodes = nodes;
        self.bytes = bytes;
        let mut next = Vec::with_capacity(path.len() + 1);
        next.extend_from_slice(path);
        next.push(id.to_owned());
        self.paths.push_back(next);
        Ok(())
    }
    #[inline]
    pub(super) fn pop(&mut self) -> Option<Vec<String>> {
        self.paths.pop_front()
    }
    // Completed eligible paths remain charged while retained in the result.
    #[inline]
    pub(super) fn release(&mut self, path: &[String]) {
        self.nodes = self.nodes.saturating_sub(path.len());
        let path_bytes = path
            .iter()
            .map(String::len)
            .fold(0_usize, usize::saturating_add);
        self.bytes = self.bytes.saturating_sub(path_bytes);
    }
}
