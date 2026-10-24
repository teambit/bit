use crate::{File, Request, invalid_request, limits, scan};
use rayon::{ThreadPool, prelude::*};
use serde_json::{Value, json};
use std::sync::atomic::{AtomicUsize, Ordering};

/// Work-steal across the whole request while bounding retained output independently.
pub(crate) fn process(input: &str, pool: &ThreadPool) -> Result<Value, serde_json::Error> {
    let request: Request = serde_json::from_str(input)?;
    if request.version != 1 || request.files.len() > limits::BATCH_FILES {
        return Ok(invalid_request("unsupported scanner request"));
    }
    let remaining = AtomicUsize::new(8 * 1024 * 1024);
    let files: Vec<Option<Value>> = pool.install(|| {
        request.files
            .par_iter()
            .map(|file| bounded(file, !request.options.is_empty(), &remaining))
            .collect::<Result<_, _>>()
    })?;
    if files.iter().any(Option::is_none) {
        return Ok(invalid_request("embedded scanner output limit"));
    }
    Ok(json!({"version":1,"id":request.id,"files":files}))
}

fn bounded(
    file: &File,
    unsupported: bool,
    remaining: &AtomicUsize,
) -> Result<Option<Value>, serde_json::Error> {
    if remaining.load(Ordering::Relaxed) == 0 {
        return Ok(None);
    }
    let outcome = scan(file, unsupported);
    let bytes = serde_json::to_vec(&outcome)?.len();
    if !reserve(remaining, bytes) {
        return Ok(None);
    }
    Ok(Some(serde_json::to_value(outcome)?))
}

fn reserve(remaining: &AtomicUsize, bytes: usize) -> bool {
    let mut budget = remaining.load(Ordering::Relaxed);
    loop {
        let Some(next) = budget.checked_sub(bytes) else {
            remaining.store(0, Ordering::Relaxed);
            return false;
        };
        match remaining.compare_exchange_weak(budget, next, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return true,
            Err(current) => budget = current,
        }
    }
}
