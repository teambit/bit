//! Serial and `Rayon`-parallel file merge classification ([`classify_all`], [`Execution`]) across current component files.

use super::{Execution, classify};
use rayon::prelude::*;
use serde_json::Value;
use std::io;

/// Classifies all current files in `execution` serially or in parallel across the `Rayon` pool.
pub(super) fn classify_all(execution: &Execution<'_>) -> io::Result<Vec<Value>> {
    if execution.request.current.is_empty() {
        return Ok(Vec::new());
    }
    if should_classify_serially(execution) {
        execution.request.current
            .iter()
            .enumerate()
            .map(|(index, file)| classify(index, file, execution))
            .collect()
    } else {
        execution.request.current
            .par_iter()
            .enumerate()
            .map(|(index, file)| classify(index, file, execution))
            .collect()
    }
}

#[inline]
fn should_classify_serially(execution: &Execution<'_>) -> bool {
    execution.request.current.len() < 2
        || execution.other.is_empty()
        || rayon::current_thread_index().is_none()
        || rayon::current_num_threads() <= 1
}
