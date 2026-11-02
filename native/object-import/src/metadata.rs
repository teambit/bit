//! Bounded zlib stream inflation ([`inflate`], [`MAX_BYTES`]) for repository object metadata headers and bodies.

#[cfg(test)]
mod tests;

use flate2::{Decompress, FlushDecompress, Status};

/// Maximum inflated byte size (256 KiB) allowed for inline metadata object streams.
pub(crate) const MAX_BYTES: usize = 256 * 1024;

// Only losslessly decoded, completely terminated streams can bypass Node inflation.
pub(crate) fn inflate(compressed: &[u8]) -> Option<String> {
    if compressed.is_empty() || compressed.len() > MAX_BYTES * 2 {
        return None;
    }
    let mut decoder = Decompress::new(true);
    let mut chunk = [0_u8; 16 * 1024];
    let mut output = Vec::with_capacity(compressed.len().min(MAX_BYTES));
    while !inflate_step(&mut decoder, compressed, &mut chunk, &mut output)? {}
    if decoder.total_in() != compressed.len() as u64 {
        return None;
    }
    String::from_utf8(output).ok()
}

#[inline]
fn inflate_step(
    decoder: &mut Decompress,
    compressed: &[u8],
    chunk: &mut [u8],
    output: &mut Vec<u8>,
) -> Option<bool> {
    let before_in = decoder.total_in();
    let before_out = decoder.total_out();
    let status = decoder
        .decompress(&compressed[before_in as usize..], chunk, FlushDecompress::None)
        .ok()?;
    let count = (decoder.total_out() - before_out) as usize;
    if output.len().saturating_add(count) > MAX_BYTES {
        return None;
    }
    output.extend_from_slice(&chunk[..count]);
    if status == Status::StreamEnd {
        return Some(true);
    }
    (decoder.total_in() != before_in || count != 0).then_some(false)
}
