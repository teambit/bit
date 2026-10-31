#[cfg(test)]
mod tests;

use super::super::wire;
use crate::{
    checkout::repository::{SourceRecord, read_source_record},
    read_budget::Budget,
};
use rayon::prelude::*;
use std::{io, path::Path};

pub(super) fn load(
    directory: &Path,
    models: &[wire::Model],
    maximum: usize,
) -> io::Result<Vec<Vec<u8>>> {
    let budget = (maximum, super::super::MAX_BYTES);
    let mut output = Vec::with_capacity(models.len());
    let records = if models.len() >= 8
        && rayon::current_thread_index().is_some()
        && rayon::current_num_threads() > 1
    {
        parallel(directory, models, budget).or_else(|_| serial(directory, models, budget))?
    } else {
        serial(directory, models, budget)?
    };
    for (model, record) in models.iter().zip(records) {
        crate::merge_transaction::reads::source(crate::merge_history::hash(&model.hash)?, &record)?;
        output.push(record.body);
    }
    Ok(output)
}
fn parallel(
    directory: &Path,
    files: &[wire::Model],
    budget: (usize, usize),
) -> io::Result<Vec<SourceRecord>> {
    let raw = Budget::new(budget.0);
    let compressed = Budget::new(budget.1);
    files
        .par_iter()
        .map(|model| {
            crate::checkout::repository::read_source_shared(
                directory,
                crate::merge_history::hash(&model.hash)?,
                &raw,
                &compressed,
            )
        })
        .collect()
}
fn serial(
    directory: &Path,
    files: &[wire::Model],
    mut budget: (usize, usize),
) -> io::Result<Vec<SourceRecord>> {
    files
        .iter()
        .map(|model| {
            let record = one(directory, model, budget)?;
            budget.0 -= record.body.len();
            budget.1 -= record.compressed.len();
            Ok(record)
        })
        .collect()
}
fn one(directory: &Path, model: &wire::Model, budget: (usize, usize)) -> io::Result<SourceRecord> {
    let mut compressed = super::super::MAX_BYTES - budget.1;
    read_source_record(
        directory,
        crate::merge_history::hash(&model.hash)?,
        budget.0,
        &mut compressed,
    )
}
