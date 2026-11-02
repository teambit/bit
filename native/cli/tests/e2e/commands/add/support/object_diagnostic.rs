//! Decode ([`decode`]) bounded `zlib`-compressed object failures for diagnostics without changing compared bytes.
//!
//! Decompresses up to 4 KiB of UTF-8 scope object payloads for human-readable diff diagnostics.

use std::io::Read;

/// Decompresses up to 4096 bytes of a `zlib`-compressed scope object into a UTF-8 diagnostic string.
pub(super) fn decode(bytes: &[u8]) -> Option<String> {
    let mut decoded = Vec::new();
    flate2::read::ZlibDecoder::new(bytes)
        .take(4097)
        .read_to_end(&mut decoded)
        .ok()?;
    if decoded.len() > 4096 {
        return None;
    }
    Some(std::str::from_utf8(&decoded).ok()?.replace('\0', r"\0"))
}
