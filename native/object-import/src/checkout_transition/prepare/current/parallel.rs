use super::{Loaded, read, wire};
use rayon::prelude::*;
use std::io;

const MAX_BYTES: usize = 32 * 1024 * 1024;

pub(super) fn load(files: &[wire::Current], total: &mut usize) -> io::Result<Vec<Loaded>> {
    let mut output = Vec::with_capacity(files.len());
    for batch in files.chunks(64) {
        let loaded = read_batch(batch, *total)
            .or_else(|_| smaller_batches(batch, *total, rayon::current_num_threads()))?;
        for (file, bytes) in loaded {
            *total += bytes;
            output.push(file);
        }
    }
    Ok(output)
}

// Divide the remaining budget before scheduling reads, so concurrent allocations remain bounded.
// Retry skewed file sizes in smaller batches without publishing any partially prepared plan.
fn read_batch(files: &[wire::Current], total: usize) -> io::Result<Vec<(Loaded, usize)>> {
    let maximum = (MAX_BYTES - total) / files.len();
    files
        .par_iter()
        .map(|file| {
            let initial = MAX_BYTES - maximum;
            let mut used = initial;
            read(file, &mut used).map(|loaded| (loaded, used - initial))
        })
        .collect()
}

fn smaller_batches(
    files: &[wire::Current],
    mut total: usize,
    width: usize,
) -> io::Result<Vec<(Loaded, usize)>> {
    let mut output = Vec::with_capacity(files.len());
    for batch in files.chunks(width) {
        let loaded = read_batch(batch, total)
            .or_else(
                |error| {
                    if width == 1 { Err(error) } else { smaller_batches(batch, total, 1) }
                },
            )?;
        total += loaded
            .iter()
            .map(|(_, bytes)| bytes)
            .sum::<usize>();
        output.extend(loaded);
    }
    Ok(output)
}

#[cfg(test)]
mod tests;
