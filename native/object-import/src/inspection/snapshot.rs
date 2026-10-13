use super::{MAX_BYTES, MAX_FILES, State, invalid, read, wire};
use std::{io, sync::Arc};

/// Immutable captured bytes remain available after the owning engine retires.
pub struct InspectionSnapshot {
    files: Arc<[read::File]>,
}
impl InspectionSnapshot {
    pub fn read(&self, index: usize) -> io::Result<Vec<u8>> {
        self.files
            .get(index)
            .map(|file| file.contents.clone())
            .ok_or_else(|| invalid("inspection snapshot index"))
    }
}
impl State {
    pub(crate) fn enable_memory_snapshots(&mut self) {
        self.memory_snapshots = true;
    }
    pub(crate) fn snapshot(&self, token: &str) -> io::Result<InspectionSnapshot> {
        if !self.memory_snapshots {
            return Err(invalid("inspection snapshot ownership unavailable"));
        }
        let files = self.plans.get(token).ok_or_else(|| invalid("stale inspection token"))?;
        Ok(InspectionSnapshot { files: Arc::clone(files) })
    }
}
pub(super) fn remaining(state: &mut State, incoming: usize) -> io::Result<usize> {
    state.retained.retain(|files| files.strong_count() != 0);
    let mut count = incoming;
    let mut bytes = 0;
    for files in state.retained.iter().filter_map(std::sync::Weak::upgrade) {
        count += files.len();
        bytes += files
            .iter()
            .map(|file| file.contents.len())
            .sum::<usize>();
    }
    if state.retained.len() >= MAX_FILES || count > MAX_FILES || bytes > MAX_BYTES {
        return Err(invalid("inspection retained file/byte limit"));
    }
    Ok(MAX_BYTES - bytes)
}

pub(super) fn validate_mode(request: &wire::Begin, state: &State) -> io::Result<()> {
    if request.owned_memory && !state.memory_snapshots {
        return Err(invalid("inspection memory ownership requires an embedded session"));
    }
    if request.memory_only
        && !request.owned_memory
        && request.files
            .iter()
            .any(|file| file.raw_hash.is_none() || file.snapshot_hash.is_none())
    {
        return Err(invalid("inspection memory-only capture requires caller hashes"));
    }
    Ok(())
}
