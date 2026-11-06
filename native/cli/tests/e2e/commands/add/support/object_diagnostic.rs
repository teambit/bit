//! Decode ([`decode`]) bounded `zlib`-compressed object failures for diagnostics without changing compared bytes.
//!
//! Decompresses up to [`MAX_DIAGNOSTIC_BYTES`] (4 KiB) of UTF-8 scope object payloads via [`Read`] for human-readable diff diagnostics.

use std::io::Read;

/// Maximum uncompressed payload byte count (`4096`) decoded by [`decode`] for scope object diagnostics.
const MAX_DIAGNOSTIC_BYTES: usize = 4096;

/// Decompresses up to [`MAX_DIAGNOSTIC_BYTES`] bytes of a `zlib`-compressed scope object (`bytes`) via [`Read`] into a `\0`-escaped UTF-8 diagnostic string, or `None` if binary or oversized.
pub(super) fn decode(bytes: &[u8]) -> Option<String> {
    let mut decoded = Vec::new();
    flate2::read::ZlibDecoder::new(bytes)
        .take(4097)
        .read_to_end(&mut decoded)
        .ok()?;
    if decoded.len() > MAX_DIAGNOSTIC_BYTES {
        return None;
    }
    Some(std::str::from_utf8(&decoded).ok()?.replace('\0', r"\0"))
}
