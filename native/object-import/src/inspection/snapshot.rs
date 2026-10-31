use super::{MAX_BYTES, MAX_FILES, State, invalid, wire};
use std::io;

impl State {
    pub(crate) fn enable_memory_snapshots(&mut self) {
        self.memory_snapshots = true;
    }
}
pub(super) fn remaining(state: &mut State, incoming: usize) -> io::Result<usize> {
    if incoming > MAX_FILES {
        return Err(invalid("inspection retained file/byte limit"));
    }
    state.retained.retain(|files| files.strong_count() != 0);
    let mut count = incoming;
    let mut bytes = 0_usize;
    for files in state.retained.iter().filter_map(std::sync::Weak::upgrade) {
        count = count.saturating_add(files.len());
        let file_bytes = files
            .iter()
            .map(|file| file.contents.len())
            .fold(0_usize, usize::saturating_add);
        bytes = bytes.saturating_add(file_bytes);
    }
    if state.retained.len() >= MAX_FILES || count > MAX_FILES || bytes > MAX_BYTES {
        return Err(invalid("inspection retained file/byte limit"));
    }
    Ok(MAX_BYTES.saturating_sub(bytes))
}

pub(super) fn validate_mode(request: &wire::Begin, state: &State) -> io::Result<()> {
    if request.owned_memory && !state.memory_snapshots {
        return Err(invalid("inspection memory ownership requires an embedded session"));
    }
    if request.memory_only
        && !request.owned_memory
        && request.files
            .iter()
            .any(|file| {
                file.raw_hash
                    .as_deref()
                    .is_none_or(|hash| hash.trim().is_empty())
                    || file.snapshot_hash
                        .as_deref()
                        .is_none_or(|hash| hash.trim().is_empty())
            })
    {
        return Err(invalid("inspection memory-only capture requires caller hashes"));
    }
    Ok(())
}
