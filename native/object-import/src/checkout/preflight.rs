//! Parallel and sequential checkout source preflight loading with bounded memory budgets.

use super::{Input, MAX_BYTES, Request, cache, eol, invalid, repository, sequential_preflight};
use crate::read_budget::Budget;
use rayon::{ThreadPool, prelude::*};
use std::io;

#[inline]
pub(super) fn load(
    request: &Request,
    state: &mut cache::State,
    use_cache: bool,
    pool: &ThreadPool,
) -> io::Result<Vec<Vec<u8>>> {
    if request.files.is_empty() {
        return Ok(Vec::new());
    }
    if request.files.len() >= 32
        && pool.current_num_threads() > 1
        && let Ok(files) = parallel(request, state, use_cache, pool)
    {
        return Ok(files);
    }
    // Changed files and conservative normalization reservations can still use
    // the canonical read-only retry before any workspace writes.
    sequential_preflight(request, state, use_cache)
}
fn parallel(
    request: &Request,
    state: &mut cache::State,
    use_cache: bool,
    pool: &ThreadPool,
) -> io::Result<Vec<Vec<u8>>> {
    let raw = Budget::new(MAX_BYTES);
    let packed = Budget::new(MAX_BYTES);
    let bodies = pool.install(|| {
        request.files
            .par_iter()
            .map(|input| read(request, input, state, use_cache, (&raw, &packed)))
            .collect::<io::Result<Vec<_>>>()
    })?;
    let mut files = Vec::with_capacity(request.files.len());
    for (input, body) in request.files.iter().zip(bodies) {
        let length = body.len();
        let uncached = state
            .get(&request.directory, input.hash)
            .is_none()
            .then(|| body.clone());
        let contents = if input.normalize {
            let normalized = eol::auto(body);
            raw.reserve(normalized.len().saturating_sub(length))
                .map_err(|_| invalid("checkout materialized bytes out of bounds"))?;
            normalized
        } else {
            body
        };
        if let Some(raw_body) = uncached {
            state.insert(&request.directory, input.hash, raw_body);
        }
        files.push(contents);
    }
    Ok(files)
}
#[inline]
fn read(
    request: &Request,
    input: &Input,
    state: &cache::State,
    use_cache: bool,
    budget: (&Budget, &Budget),
) -> io::Result<Vec<u8>> {
    if let Some(body) = input.cached(request, state, use_cache) {
        budget.0.reserve(body.len())?;
        return Ok(body.clone());
    }
    repository::read_source_shared(&request.directory, input.hash, budget.0, budget.1)
        .map(|record| record.body)
}
