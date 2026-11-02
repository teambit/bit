//! Rayon parallel workspace file reader ([`load`]) with serial fallback on concurrent file modifications.

#[cfg(test)]
mod tests;

use super::{Loaded, read, read_shared, wire};
use crate::read_budget::Budget;
use rayon::prelude::*;
use std::io;

/// Maximum total byte budget (`32 MiB`) for parallel workspace file loading.
const MAX_BYTES: usize = 32 * 1024 * 1024;

/// Load and verify `files` in parallel under [`MAX_BYTES`], falling back to [`serial`] on error.
#[inline]
pub(super) fn load(files: &[wire::Current], total: &mut usize) -> io::Result<Vec<Loaded>> {
    if files.is_empty() {
        return Ok(Vec::new());
    }
    let budget = Budget::new(MAX_BYTES.saturating_sub(*total));
    let loaded = files
        .par_iter()
        .map(|file| read_shared(file, &budget))
        .collect::<io::Result<Vec<_>>>()
        .or_else(|_| serial(files, *total))?;
    Ok(loaded
        .into_iter()
        .map(|(file, bytes)| {
            *total = total.saturating_add(bytes);
            file
        })
        .collect())
}

/// Changed files retry sequentially without publishing any partially prepared plan.
#[inline]
fn serial(files: &[wire::Current], mut total: usize) -> io::Result<Vec<(Loaded, usize)>> {
    files
        .iter()
        .map(|file| {
            let initial = total;
            read(file, &mut total).map(|loaded| (loaded, total.saturating_sub(initial)))
        })
        .collect()
}
