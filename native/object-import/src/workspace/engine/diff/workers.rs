//! Bounded parallel worker [`execute`] and index-ordered assembly for [`Prepared`] [`FileDiff`] items.

use super::{FileDiff, Prepared, one};
use rayon::prelude::*;
use std::{
    io,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

pub(super) fn execute(
    files: &[Prepared],
    directory: Option<&Path>,
    git: &str,
    color: bool,
    output: &AtomicUsize,
) -> io::Result<Vec<FileDiff>> {
    if files.is_empty() {
        return Ok(Vec::new());
    }
    let next = AtomicUsize::new(0);
    let workers = rayon::current_num_threads()
        .min(4)
        .min(files.len())
        .max(1);
    let batches: Vec<_> = (0..workers)
        .into_par_iter()
        .map(|_| worker_batch(files, directory, git, color, output, &next))
        .collect();
    assemble_ordered(files.len(), batches)
}

#[inline]
fn worker_batch(
    files: &[Prepared],
    directory: Option<&Path>,
    git: &str,
    color: bool,
    output: &AtomicUsize,
    next: &AtomicUsize,
) -> io::Result<Vec<(usize, FileDiff)>> {
    let mut results = Vec::with_capacity(files.len().div_ceil(4));
    loop {
        let index = next.fetch_add(1, Ordering::Relaxed);
        let Some(file) = files.get(index) else {
            return Ok(results);
        };
        match one(file, index, directory, git, color, output) {
            Ok(result) => results.push((index, result)),
            Err(error) => {
                next.store(files.len(), Ordering::Relaxed);
                return Err(error);
            }
        }
    }
}

#[inline]
fn assemble_ordered(
    count: usize,
    batches: Vec<io::Result<Vec<(usize, FileDiff)>>>,
) -> io::Result<Vec<FileDiff>> {
    let mut ordered: Vec<Option<FileDiff>> = std::iter::repeat_with(|| None).take(count).collect();
    for batch in batches {
        for (index, file) in batch? {
            let slot = ordered
                .get_mut(index)
                .ok_or_else(|| io::Error::other("workspace diff worker index out of bounds"))?;
            if slot.replace(file).is_some() {
                return Err(io::Error::other("workspace diff worker duplicate index"));
            }
        }
    }
    ordered
        .into_iter()
        .map(|file| file.ok_or_else(|| io::Error::other("workspace diff worker incomplete")))
        .collect()
}
