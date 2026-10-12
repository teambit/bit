use super::{Execution, classify};
use rayon::prelude::*;
use serde_json::Value;
use std::{io, sync::LazyLock};
fn pool() -> io::Result<&'static rayon::ThreadPool> {
    static POOL: LazyLock<Result<rayon::ThreadPool, String>> = LazyLock::new(|| {
        rayon::ThreadPoolBuilder::new()
            .num_threads(4)
            .build()
            .map_err(|error| error.to_string())
    });
    POOL.as_ref().map_err(|error| io::Error::other(error.clone()))
}

pub(super) fn classify_all(execution: &Execution<'_>) -> io::Result<Vec<Value>> {
    if execution.request.current.len() < 2 {
        execution.request.current
            .iter()
            .enumerate()
            .map(|(index, file)| classify(index, file, execution))
            .collect::<io::Result<Vec<_>>>()
    } else {
        pool()?
            .install(|| {
                execution.request.current
                    .par_iter()
                    .enumerate()
                    .map(|(index, file)| classify(index, file, execution))
                    .collect::<io::Result<Vec<_>>>()
            })
    }
}
