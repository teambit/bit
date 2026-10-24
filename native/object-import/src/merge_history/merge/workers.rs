use super::{Execution, classify};
use rayon::prelude::*;
use serde_json::Value;
use std::io;

pub(super) fn classify_all(execution: &Execution<'_>) -> io::Result<Vec<Value>> {
    if execution.request.current.len() < 2 || rayon::current_thread_index().is_none() {
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
