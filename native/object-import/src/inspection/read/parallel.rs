use super::{File, capture_file, wire};
use rayon::prelude::*;
use std::io;

pub(super) fn capture(
    request: &wire::Begin,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<File>> {
    let mut output = Vec::with_capacity(request.files.len());
    let mut remaining = maximum;
    for files in request.files.chunks(64) {
        let batch = read_batch(files, request, remaining, snapshots)
            .or_else(|_| smaller(files, request, remaining, snapshots))?;
        for (file, bytes) in batch {
            remaining -= bytes;
            output.push(file);
        }
    }
    Ok(output)
}

// Every concurrent read receives a disjoint share of the remaining raw/normalized budget.
fn read_batch(
    files: &[wire::Input],
    request: &wire::Begin,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<(File, usize)>> {
    let limit = maximum / files.len();
    let results: Vec<_> = files
        .par_iter()
        .map(|file| capture_file(file, request, limit, snapshots))
        .collect();
    results.into_iter().collect()
}

// Skewed file sizes retry serially before any spool or public plan is published.
fn smaller(
    files: &[wire::Input],
    request: &wire::Begin,
    mut remaining: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<(File, usize)>> {
    files
        .iter()
        .map(|file| {
            let captured = capture_file(file, request, remaining, snapshots)?;
            remaining -= captured.1;
            Ok(captured)
        })
        .collect()
}
