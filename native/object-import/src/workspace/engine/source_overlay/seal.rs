//! [`capture`] and verify [`Data`] source-overlay file and spool [`proof`] records when sealing.

use super::{Data, Entry, invalid, lookup, proof};
use rayon::prelude::*;
use std::{
    fs, io,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

/// Captures and deduplicates read-set [`proof::Proof`] records for all entries in `data`.
pub(super) fn capture(data: &Data) -> io::Result<Vec<proof::Proof>> {
    if data.entries.len() > 8192 {
        return Err(invalid("overlay entry budget"));
    }
    let declared: Option<u64> = data.entries
        .values()
        .map(|entry| match entry {
            Entry::Source(source) => source.len(),
            Entry::Removed => 0,
        })
        .try_fold(0_u64, u64::checked_add);
    if declared.is_none_or(|total| total > 64 * 1024 * 1024) {
        return Err(invalid("overlay byte budget"));
    }
    let bytes = AtomicUsize::new(0);
    let proofs = data.entries
        .par_iter()
        .map(|(path, entry)| capture_one(data, path, entry, &bytes))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(proof::unique(proofs.into_iter().flatten().collect()))
}
fn capture_one(
    data: &Data,
    destination: &Path,
    entry: &Entry,
    bytes: &AtomicUsize,
) -> io::Result<Vec<proof::Proof>> {
    for parent in destination.ancestors().skip(1) {
        if data.entries.contains_key(parent) {
            return Err(invalid("overlay conflicting parent"));
        }
    }
    if fs::symlink_metadata(destination).is_ok_and(|value| !value.is_file()) {
        return Err(invalid("overlay file replaces directory"));
    }
    let mut proofs = Vec::with_capacity(8);
    reserve(lookup::capture(destination, &data.root, &mut proofs)?, bytes)?;
    if let Entry::Source(source) = entry {
        let body = source.read()?;
        reserve(body.len(), bytes)?;
        proofs.push(proof::range(&source.path, source.offset, &body));
    }
    Ok(proofs)
}
#[inline]
fn reserve(size: usize, bytes: &AtomicUsize) -> io::Result<()> {
    if bytes.fetch_add(size, Ordering::Relaxed).saturating_add(size) > 96 * 1024 * 1024 {
        return Err(invalid("overlay captured byte budget"));
    }
    Ok(())
}
