use super::super::wire;
use crate::checkout::repository::{SourceRecord, read_source_record};
use rayon::prelude::*;
use std::{io, path::Path};

pub(super) fn load(
    directory: &Path,
    models: &[wire::Model],
    maximum: usize,
) -> io::Result<Vec<Vec<u8>>> {
    let mut budget = (maximum, super::super::MAX_BYTES);
    let mut output = Vec::with_capacity(models.len());
    for files in models.chunks(64) {
        let records = if files.len() >= 8
            && rayon::current_thread_index().is_some()
            && rayon::current_num_threads() > 1
        {
            parallel(directory, files, budget).or_else(|_| serial(directory, files, budget))?
        } else {
            serial(directory, files, budget)?
        };
        for (model, record) in files.iter().zip(records) {
            budget.0 -= record.body.len();
            budget.1 -= record.compressed.len();
            crate::merge_transaction::reads::source(
                crate::merge_history::hash(&model.hash)?,
                &record,
            )?;
            output.push(record.body);
        }
    }
    Ok(output)
}
fn parallel(
    directory: &Path,
    files: &[wire::Model],
    budget: (usize, usize),
) -> io::Result<Vec<SourceRecord>> {
    let share = (budget.0 / files.len(), budget.1 / files.len());
    let records: Vec<_> = files
        .par_iter()
        .map(|model| one(directory, model, share))
        .collect();
    records.into_iter().collect()
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

#[cfg(test)]
mod tests;
