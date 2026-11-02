//! Header validation ([`check_header`], [`invalid`]) and [`ZlibEncoder`] compression ([`persist_serialized`]) for writing mutable serialized objects into [`Store`].

use crate::store::Store;
use flate2::{Compression, write::ZlibEncoder};
use std::io::{self, Write};

/// Validates header invariants, zlib-compresses `serialized`, and writes it to `store` under `hash`.
pub(crate) fn persist_serialized(
    store: &Store,
    hash: &str,
    serialized: &[u8],
    models: bool,
) -> io::Result<usize> {
    let hash = hash.trim();
    check_header(hash, serialized, models)?;
    let mut encoder =
        ZlibEncoder::new(Vec::with_capacity(serialized.len() / 2), Compression::default());
    encoder.write_all(serialized)?;
    let compressed = encoder.finish()?;
    store.write(hash, &compressed)?;
    Ok(compressed.len())
}

/// Validates the `<kind> <hash> <utf16-len>\0` header of a mutable `serialized` object.
fn check_header(hash: &str, serialized: &[u8], models: bool) -> io::Result<()> {
    crate::merge_history::hash(hash)?;
    let end = serialized
        .iter()
        .position(|byte| *byte == 0)
        .filter(|end| *end < 256)
        .ok_or_else(|| invalid("invalid mutable header"))?;
    if serialized.len().saturating_sub(end + 1) > 32 * 1024 * 1024 {
        return Err(invalid("unsupported mutable identity or type"));
    }
    let header = std::str::from_utf8(&serialized[..end])
        .map_err(|_| invalid("invalid mutable header text"))?;
    let body = std::str::from_utf8(&serialized[end + 1..])
        .map_err(|_| invalid("invalid mutable body text"))?;
    let mut parts = header.split(' ');
    let kind = parts.next();
    let valid_kind = matches!(kind, Some("Version" | "VersionHistory" | "LaneHistory"))
        || (models && matches!(kind, Some("Component" | "Lane" | "Symlink" | "ScopeMeta")));
    let expected_units = if body.is_ascii() { body.len() } else { body.encode_utf16().count() };
    if !valid_kind
        || parts
            .next()
            .is_none_or(|actual| !actual.eq_ignore_ascii_case(hash))
        || parts
            .next()
            .and_then(|size| size.parse::<usize>().ok())
            .is_none_or(|size| {
                size > 32 * 1024 * 1024 || parts.next().is_some() || size != expected_units
            })
    {
        return Err(invalid("unsupported mutable identity or type"));
    }
    Ok(())
}

/// Constructs an `InvalidData` I/O error with `message`.
#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
