use super::super::{invalid, wire};
use crate::{checkout::repository, read_budget::Budget};
use rayon::prelude::*;
use std::{io, path::Path};
const MAX_BYTES: usize = 32 * 1024 * 1024;
type Source = ([u8; 20], repository::SourceRecord);
pub(in crate::checkout_transition) fn load(
    directory: &Path,
    version: &wire::Version,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Vec<u8>>> {
    crate::checkout::plan::verify_manifest(
        directory,
        &version.hash,
        &serde_json::to_value(&version.files).map_err(io::Error::other)?,
        compressed,
    )?;
    load_files(directory, &version.files, total, compressed)
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
    let mut files = Vec::new();
    for file in manifests {
        let body = crate::checkout::repository::source(
            directory,
            crate::merge_history::hash(&file.hash)?,
            32 * 1024 * 1024 - *total,
            compressed,
        )?;
        *total += body.len();
        if *total > 32 * 1024 * 1024 {
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
        *total += record.body.len();
        *compressed += record.compressed.len();
        crate::merge_transaction::reads::source(hash, &record)?;
        files.push(record.body);
    }
    Ok(files)
}
fn read_batch(
    directory: &Path,
    batch: &[wire::Manifest],
    total: usize,
    compressed: usize,
) -> io::Result<Vec<Source>> {
    let raw = Budget::new(MAX_BYTES - total);
    let packed = Budget::new(MAX_BYTES - compressed);
    batch
        .par_iter()
        .map(|file| {
            let hash = crate::merge_history::hash(&file.hash)?;
            repository::read_source_shared(directory, hash, &raw, &packed)
                .map(|record| (hash, record))
        })
        .collect()
}
fn serial_batch(
    directory: &Path,
    batch: &[wire::Manifest],
    mut total: usize,
    mut compressed: usize,
) -> io::Result<Vec<Source>> {
    batch
        .iter()
        .map(|file| {
            let hash = crate::merge_history::hash(&file.hash)?;
            let record = repository::read_source_record(
                directory,
                hash,
                MAX_BYTES - total,
                &mut compressed,
            )?;
            total += record.body.len();
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
) -> io::Result<Vec<Option<Vec<u8>>>> {
    crate::checkout::plan::verify_manifest(
        directory,
        &version.hash,
        &serde_json::to_value(&version.files).map_err(io::Error::other)?,
        compressed,
    )?;
    if needed.len() != version.files.len() {
        return Err(invalid("checkout selected Source count"));
    }
    let manifests: Vec<_> = version.files
        .iter()
        .zip(needed)
        .filter(|(_, needed)| **needed)
        .map(|(file, _)| file.clone())
        .collect();
    let mut bodies = load_files(directory, &manifests, total, compressed)?.into_iter();
    Ok(needed
        .iter()
        .map(|needed| if *needed { bodies.next() } else { None })
        .collect())
}
