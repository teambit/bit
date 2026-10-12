use super::{Input, MAX_BYTES, Request, cache, eol, invalid, repository, sequential_preflight};
use rayon::{ThreadPool, prelude::*};
use std::io;

pub(super) fn load(
    request: &Request,
    state: &mut cache::State,
    use_cache: bool,
    pool: &ThreadPool,
) -> io::Result<Vec<Vec<u8>>> {
    if request.files.len() >= 32
        && pool.current_num_threads() > 1
        && let Ok(files) = parallel(request, state, use_cache, pool)
    {
        return Ok(files);
    }
    // A large single Source may exceed a worker's conservative share while fitting
    // the original batch budget. Retry the read-only phase with that full budget.
    sequential_preflight(request, state, use_cache)
}
fn parallel(
    request: &Request,
    state: &mut cache::State,
    use_cache: bool,
    pool: &ThreadPool,
) -> io::Result<Vec<Vec<u8>>> {
    let mut files = Vec::with_capacity(request.files.len());
    let mut inflated = 0;
    let mut compressed = 0;
    for inputs in request.files.chunks(pool.current_num_threads()) {
        let budget =
            ((MAX_BYTES - inflated) / inputs.len(), (MAX_BYTES - compressed) / inputs.len());
        let batch = pool.install(|| {
            inputs
                .par_iter()
                .map(|input| read(request, input, state, use_cache, budget))
                .collect::<io::Result<Vec<_>>>()
        })?;
        for (input, (body, packed)) in inputs.iter().zip(batch) {
            compressed += packed;
            state.insert(&request.directory, input.hash, body.clone());
            let contents = if input.normalize { eol::auto(body) } else { body };
            inflated += contents.len();
            if inflated > MAX_BYTES {
                return Err(invalid("checkout materialized bytes out of bounds"));
            }
            files.push(contents);
        }
    }
    Ok(files)
}
fn read(
    request: &Request,
    input: &Input,
    state: &cache::State,
    use_cache: bool,
    budget: (usize, usize),
) -> io::Result<(Vec<u8>, usize)> {
    if use_cache && let Some(body) = state.get(&request.directory, input.hash) {
        if body.len() > budget.0 {
            return Err(invalid("checkout parallel Source share"));
        }
        return Ok((body.clone(), 0));
    }
    let mut compressed = MAX_BYTES - budget.1;
    let body = repository::source(&request.directory, input.hash, budget.0, &mut compressed)?;
    Ok((body, compressed - (MAX_BYTES - budget.1)))
}
