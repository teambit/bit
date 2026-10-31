#[cfg(test)]
mod tests;

use super::{Loaded, read, read_shared, wire};
use crate::read_budget::Budget;
use rayon::prelude::*;
use std::io;

const MAX_BYTES: usize = 32 * 1024 * 1024;

pub(super) fn load(files: &[wire::Current], total: &mut usize) -> io::Result<Vec<Loaded>> {
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

// Changed files retry without publishing any partially prepared plan.
fn serial(files: &[wire::Current], mut total: usize) -> io::Result<Vec<(Loaded, usize)>> {
    files
        .iter()
        .map(|file| {
            let initial = total;
            read(file, &mut total).map(|loaded| (loaded, total.saturating_sub(initial)))
        })
        .collect()
}
