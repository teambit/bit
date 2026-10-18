//! Decode bounded object failures for diagnostics without changing compared bytes.
use std::io::Read;

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
