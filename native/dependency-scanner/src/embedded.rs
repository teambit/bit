//! Work-stealing batch execution and output byte bounding for embedded scanner requests.
//!
//! Runs file scans across a Rayon thread pool while enforcing total response size limits.

use crate::{File, Request, invalid_request, limits, scan};
use rayon::{ThreadPool, prelude::*};
use serde_json::{Value, json};
use std::sync::atomic::{AtomicUsize, Ordering};

/// Work-steal across the whole request while bounding retained output independently.
pub(crate) fn process(input: &str, pool: &ThreadPool) -> Result<Value, serde_json::Error> {
    let cleaned = input.trim_start_matches('\u{feff}').trim();
    if cleaned.is_empty() {
        return Ok(invalid_request("empty scanner request"));
    }
    let request: Request = serde_json::from_str(cleaned)?;
    if request.version != 1 || request.files.len() > limits::BATCH_FILES {
        return Ok(invalid_request("unsupported scanner request"));
    }
    if request.files.is_empty() {
        return Ok(json!({"version":1,"id":request.id,"files":[]}));
    }
    let remaining = AtomicUsize::new(8 * 1024 * 1024);
    let Some(files): Option<Vec<Value>> = pool.install(|| {
        request.files
            .par_iter()
            .map(|file| bounded(file, !request.options.is_empty(), &remaining))
            .collect::<Result<_, _>>()
    })?
    else {
        return Ok(invalid_request("embedded scanner output limit"));
    };
    Ok(json!({"version":1,"id":request.id,"files":files}))
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct ByteCount(usize);

impl std::io::Write for ByteCount {
    #[inline]
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0 += buf.len();
        Ok(buf.len())
    }
    #[inline]
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[inline]
fn bounded(
    file: &File,
    unsupported: bool,
    remaining: &AtomicUsize,
) -> Result<Option<Value>, serde_json::Error> {
    if remaining.load(Ordering::Relaxed) == 0 {
        return Ok(None);
    }
    let outcome = scan(file, unsupported);
    let mut counter = ByteCount(0);
    serde_json::to_writer(&mut counter, &outcome)?;
    if !reserve(remaining, counter.0) {
        return Ok(None);
    }
    Ok(Some(serde_json::to_value(outcome)?))
}

#[inline]
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
