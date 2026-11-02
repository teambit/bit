//! Target and base [`Source`] object loading ([`load_with_overlay`]) with optional import [`overlay`] support.

pub(super) use overlay::body;
mod overlay;

use super::super::{invalid, wire};
use crate::{checkout::repository, read_budget::Budget};
use rayon::prelude::*;
use std::{io, path::Path};
/// Maximum total byte budget (`32 MiB`) for loading target and base `Source` blobs.
const MAX_BYTES: usize = 32 * 1024 * 1024;
/// Pair of a 20-byte SHA-1 object hash and its verified [`repository::SourceRecord`].
type Source = ([u8; 20], repository::SourceRecord);
/// Verify `version` and load its `Source` file bodies from `directory` or `overlay`.
#[inline]
pub(in crate::checkout_transition) fn load_with_overlay(
    directory: &Path,
    version: &wire::Version,
    total: &mut usize,
    compressed: &mut usize,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Vec<u8>>> {
    overlay::verify(directory, version, compressed, overlay)?;
    overlay::files(directory, &version.files, total, compressed, overlay)
}

fn load_files(
    directory: &Path,
    manifests: &[wire::Manifest],
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Vec<u8>>> {
    if manifests.len() >= 32
        && rayon::current_thread_index().is_some()
        && rayon::current_num_threads() > 1
    {
        return parallel(directory, manifests, total, compressed);
    }
    let mut files = Vec::with_capacity(manifests.len());
    for file in manifests {
        let remaining =
            MAX_BYTES.checked_sub(*total).ok_or_else(|| invalid("checkout prepared raw limit"))?;
        let body = crate::checkout::repository::source(
            directory,
            crate::merge_history::hash(file.hash.trim())?,
            remaining,
            compressed,
        )?;
        *total = total.saturating_add(body.len());
        if *total > MAX_BYTES {
            return Err(invalid("checkout prepared raw limit"));
        }
        files.push(body);
    }
    Ok(files)
}

fn parallel(
    directory: &Path,
    manifests: &[wire::Manifest],
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Vec<u8>>> {
    let mut files = Vec::with_capacity(manifests.len());
    let records = read_batch(directory, manifests, *total, *compressed)
        .or_else(|_| serial_batch(directory, manifests, *total, *compressed))?;
    for (hash, record) in records {
        *total = total.saturating_add(record.body.len());
        *compressed = compressed.saturating_add(record.compressed.len());
        if *total > MAX_BYTES || *compressed > MAX_BYTES {
            return Err(invalid("checkout prepared raw limit"));
        }
        crate::merge_transaction::reads::source(hash, &record)?;
        files.push(record.body);
    }
    Ok(files)
}
#[inline]
fn read_batch(
    directory: &Path,
    batch: &[wire::Manifest],
    total: usize,
    compressed: usize,
) -> io::Result<Vec<Source>> {
    let raw = Budget::new(
        MAX_BYTES.checked_sub(total).ok_or_else(|| invalid("checkout prepared raw limit"))?,
    );
    let packed = Budget::new(
        MAX_BYTES
            .checked_sub(compressed)
            .ok_or_else(|| invalid("checkout prepared compressed limit"))?,
    );
    batch
        .par_iter()
        .map(|file| {
            let hash = crate::merge_history::hash(file.hash.trim())?;
            repository::read_source_shared(directory, hash, &raw, &packed)
                .map(|record| (hash, record))
        })
        .collect()
}
#[inline]
fn serial_batch(
    directory: &Path,
    batch: &[wire::Manifest],
    mut total: usize,
    mut compressed: usize,
) -> io::Result<Vec<Source>> {
    batch
        .iter()
        .map(|file| {
            let hash = crate::merge_history::hash(file.hash.trim())?;
            let remaining = MAX_BYTES
                .checked_sub(total)
                .ok_or_else(|| invalid("checkout prepared raw limit"))?;
            let record =
                repository::read_source_record(directory, hash, remaining, &mut compressed)?;
            total = total.saturating_add(record.body.len());
            Ok((hash, record))
        })
        .collect()
}

/// Verify the complete Version, but read bodies only where a three-way merge needs them.
pub(super) fn selected(
    directory: &Path,
    version: &wire::Version,
    needed: &[bool],
    total: &mut usize,
    compressed: &mut usize,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Option<Vec<u8>>>> {
    overlay::verify(directory, version, compressed, overlay)?;
    if needed.len() != version.files.len() {
        return Err(invalid("checkout selected Source count"));
    }
    if !needed.iter().any(|&flag| flag) {
        return Ok(vec![None; needed.len()]);
    }
    let manifests: Vec<_> = version.files
        .iter()
        .zip(needed)
        .filter(|(_, needed)| **needed)
        .map(|(file, _)| file.clone())
        .collect();
    let mut bodies = overlay::files(directory, &manifests, total, compressed, overlay)?.into_iter();
    Ok(needed
        .iter()
        .map(|needed| if *needed { bodies.next() } else { None })
        .collect())
}

#[inline]
pub(in crate::checkout_transition) fn verify(
    directory: &Path,
    version: &wire::Version,
    compressed: &mut usize,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<()> {
    overlay::verify(directory, version, compressed, overlay)
}
