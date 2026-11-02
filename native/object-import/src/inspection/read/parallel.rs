//! Parallel workspace file capture ([`capture`]) with serial fallback on shared [`Budget`] contention.

use super::{File, capture_file, capture_shared, wire};
use crate::read_budget::Budget;
use rayon::prelude::*;
use std::io;

/// Captures workspace files in `request` in parallel within `maximum` bytes, falling back serially.
pub(super) fn capture(
    request: &wire::Begin,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<File>> {
    let maximum = maximum.min(super::super::MAX_BYTES);
    let budget = Budget::new(maximum);
    request.files
        .par_iter()
        .map(|file| capture_shared(file, request, &budget, snapshots))
        .collect::<io::Result<Vec<_>>>()
        .or_else(|error| {
            if error.kind() == io::ErrorKind::InvalidData {
                smaller(&request.files, request, maximum, snapshots)
            } else {
                Err(error)
            }
        })
}

/// Captures `files` serially within `remaining` bytes after parallel [`Budget`] contention.
/// Skewed file sizes retry serially before any spool or public plan is published.
#[inline]
fn smaller(
    files: &[wire::Input],
    request: &wire::Begin,
    mut remaining: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<File>> {
    let mut output = Vec::with_capacity(files.len());
    for file in files {
        let (captured, bytes) = capture_file(file, request, remaining, snapshots)?;
        remaining = remaining.saturating_sub(bytes);
        output.push(captured);
    }
    Ok(output)
}
