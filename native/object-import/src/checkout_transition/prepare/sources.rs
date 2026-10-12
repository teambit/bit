use super::super::{invalid, wire};
use crate::checkout::repository;
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
    if version.files.len() >= 32
        && rayon::current_thread_index().is_some()
        && rayon::current_num_threads() > 1
    {
        return parallel(directory, version, total, compressed);
    }
    let mut files = Vec::new();
    for file in &version.files {
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
    version: &wire::Version,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Vec<u8>>> {
    let mut files = Vec::with_capacity(version.files.len());
    for batch in version.files.chunks(64) {
        let records = read_batch(directory, batch, *total, *compressed)
            .or_else(|_| worker_batches(directory, batch, *total, *compressed))?;
        for (hash, record) in records {
            *total += record.body.len();
            *compressed += record.compressed.len();
            crate::merge_transaction::reads::source(hash, &record)?;
            files.push(record.body);
        }
    }
    Ok(files)
}
fn read_batch(
    directory: &Path,
    batch: &[wire::Manifest],
    total: usize,
    compressed: usize,
) -> io::Result<Vec<Source>> {
    let budget = ((MAX_BYTES - total) / batch.len(), (MAX_BYTES - compressed) / batch.len());
    batch
        .par_iter()
        .map(|file| {
            let hash = crate::merge_history::hash(&file.hash)?;
            let mut packed = MAX_BYTES - budget.1;
            repository::read_source_record(directory, hash, budget.0, &mut packed)
                .map(|record| (hash, record))
        })
        .collect()
}
fn worker_batches(
    directory: &Path,
    files: &[wire::Manifest],
    mut total: usize,
    mut compressed: usize,
) -> io::Result<Vec<Source>> {
    let mut sources = Vec::with_capacity(files.len());
    for batch in files.chunks(rayon::current_num_threads()) {
        let records = read_batch(directory, batch, total, compressed)
            .or_else(|_| serial_batch(directory, batch, total, compressed))?;
        total += records
            .iter()
            .map(|(_, record)| record.body.len())
            .sum::<usize>();
        compressed += records
            .iter()
            .map(|(_, record)| record.compressed.len())
            .sum::<usize>();
        sources.extend(records);
    }
    Ok(sources)
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
