use super::{File, capture_file, capture_shared, wire};
use crate::read_budget::Budget;
use rayon::prelude::*;
use std::io;

pub(super) fn capture(
    request: &wire::Begin,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<File>> {
    let budget = Budget::new(maximum);
    let result = request.files
        .par_iter()
        .map(|file| capture_shared(file, request, &budget, snapshots))
        .collect::<io::Result<Vec<_>>>();
    result.or_else(|_| smaller(&request.files, request, maximum, snapshots))
}

// Skewed file sizes retry serially before any spool or public plan is published.
fn smaller(
    files: &[wire::Input],
    request: &wire::Begin,
    mut remaining: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<File>> {
    files
        .iter()
        .map(|file| {
            let captured = capture_file(file, request, remaining, snapshots)?;
            remaining = remaining.saturating_sub(captured.1);
            Ok(captured.0)
        })
        .collect()
}
