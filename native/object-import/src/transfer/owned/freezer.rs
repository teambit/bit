use std::{collections::HashSet, io, path::Path};

use super::{Descriptor, Entry, MAX_BYTES, invalid, object};

pub(super) struct Frozen {
    pub(super) entries: Vec<Entry>,
    pub(super) missing: HashSet<[u8; 20]>,
}

pub(super) fn freeze(
    directory: &Path,
    descriptors: Vec<Descriptor>,
    skip_missing: bool,
) -> io::Result<Frozen> {
    let mut frozen = Frozen { entries: Vec::new(), missing: HashSet::new() };
    let mut compressed = 0_usize;
    let mut raw = 0_usize;
    for descriptor in descriptors {
        let entry = match entry(directory, descriptor, MAX_BYTES.saturating_sub(compressed)) {
            Ok(entry) => entry,
            Err((hash, error)) if skip_missing && error.kind() == io::ErrorKind::NotFound => {
                frozen.missing.insert(hash);
                continue;
            }
            Err((_, error)) => return Err(error),
        };
        compressed = compressed.saturating_add(entry.compressed.len());
        raw = raw.saturating_add(entry.raw);
        if compressed > MAX_BYTES
            || raw > MAX_BYTES
            || frozen.entries.len() >= super::super::MAX_OBJECTS
        {
            return Err(invalid("collection raw byte budget"));
        }
        frozen.entries.push(entry);
    }
    Ok(frozen)
}

fn entry(
    directory: &Path,
    descriptor: Descriptor,
    remaining: usize,
) -> Result<Entry, ([u8; 20], io::Error)> {
    object::name(&descriptor).map_err(|error| (descriptor.hash, error))?;
    let (bytes, raw, kind) =
        object::read(directory, &descriptor, remaining).map_err(|error| (descriptor.hash, error))?;
    Ok(Entry {
        hash: descriptor.hash,
        scope: descriptor.scope,
        kind,
        compressed: bytes.into(),
        raw,
        path: None,
    })
}
