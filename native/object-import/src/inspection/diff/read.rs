//! Bounded serial ([`serial`]) and parallel ([`parallel`]) [`SourceRecord`] object body loading ([`load`]) for inspection diffs.

#[cfg(test)]
mod tests;

use super::super::wire;
use crate::{
    checkout::repository::{SourceRecord, read_source_record},
    read_budget::Budget,
};
use rayon::prelude::*;
use std::{io, path::Path};

/// Loads `Source` object bodies for `models` from `directory` within `maximum` bytes.
pub(super) fn load(
    directory: &Path,
    models: &[wire::Model],
    maximum: usize,
) -> io::Result<Vec<Vec<u8>>> {
    if models.is_empty() {
        return Ok(Vec::new());
    }
    let budget = (maximum, super::super::MAX_BYTES);
    let mut output = Vec::with_capacity(models.len());
    let records = if models.len() >= 8
        && rayon::current_thread_index().is_some()
        && rayon::current_num_threads() > 1
    {
        parallel(directory, models, budget)
            .or_else(|error| {
                if error.kind() == io::ErrorKind::InvalidData {
                    serial(directory, models, budget)
                } else {
                    Err(error)
                }
            })?
    } else {
        serial(directory, models, budget)?
    };
    for (digest, record) in records {
        crate::merge_transaction::reads::source(digest, &record)?;
        output.push(record.body);
    }
    Ok(output)
}
/// Reads `Source` records for `files` in parallel using shared atomic byte budgets.
#[inline]
fn parallel(
    directory: &Path,
    files: &[wire::Model],
    budget: (usize, usize),
) -> io::Result<Vec<([u8; 20], SourceRecord)>> {
    let raw = Budget::new(budget.0);
    let compressed = Budget::new(budget.1);
    files
        .par_iter()
        .map(|model| {
            let digest = crate::merge_history::hash(model.normalized_hash())?;
            let record = crate::checkout::repository::read_source_shared(
                directory,
                digest,
                &raw,
                &compressed,
            )?;
            Ok((digest, record))
        })
        .collect()
}
/// Reads `Source` records for `files` sequentially within `budget` `(raw, compressed)` bytes.
#[inline]
fn serial(
    directory: &Path,
    files: &[wire::Model],
    budget: (usize, usize),
) -> io::Result<Vec<([u8; 20], SourceRecord)>> {
    let mut remaining = budget.0;
    let mut compressed = super::super::MAX_BYTES.saturating_sub(budget.1);
    files
        .iter()
        .map(|model| {
            let digest = crate::merge_history::hash(model.normalized_hash())?;
            let record = read_source_record(directory, digest, remaining, &mut compressed)?;
            remaining = remaining.saturating_sub(record.body.len());
            Ok((digest, record))
        })
        .collect()
}
