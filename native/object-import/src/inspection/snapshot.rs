use super::{MAX_BYTES, MAX_FILES, State, invalid, wire};
use std::io;

impl State {
    pub(crate) fn enable_memory_snapshots(&mut self) {
        self.memory_snapshots = true;
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
