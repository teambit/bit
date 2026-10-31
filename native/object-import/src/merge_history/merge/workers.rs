use super::{Execution, classify};
use rayon::prelude::*;
use serde_json::Value;
use std::io;

pub(super) fn classify_all(execution: &Execution<'_>) -> io::Result<Vec<Value>> {
    if should_classify_serially(execution) {
        execution.request.current
            .iter()
            .enumerate()
            .map(|(index, file)| classify(index, file, execution))
            .collect::<io::Result<Vec<_>>>()
    } else {
        execution.request.current
            .par_iter()
            .enumerate()
            .map(|(index, file)| classify(index, file, execution))
            .collect::<io::Result<Vec<_>>>()
    }
}

fn should_classify_serially(execution: &Execution<'_>) -> bool {
    execution.request.current.len() < 2
        || (execution.base.is_empty() && execution.other.is_empty())
        || rayon::current_thread_index().is_none()
        || rayon::current_num_threads() <= 1
}
