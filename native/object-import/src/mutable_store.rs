//! Writing serialized objects into the object store.

use std::io::{self, Write};

use flate2::{Compression, write::ZlibEncoder};

use crate::store::Store;

pub(crate) fn persist_serialized(
    store: &Store,
    hash: &str,
    serialized: &[u8],
    models: bool,
) -> io::Result<usize> {
    check_header(hash, serialized, models)?;
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(serialized)?;
    let compressed = encoder.finish()?;
    store.write(hash, &compressed)?;
    Ok(compressed.len())
}

fn check_header(hash: &str, serialized: &[u8], models: bool) -> io::Result<()> {
    let end = serialized
        .iter()
        .position(|byte| *byte == 0)
        .filter(|end| *end < 256)
        .ok_or_else(|| invalid("invalid mutable header"))?;
    let header = std::str::from_utf8(&serialized[..end])
        .map_err(|_| invalid("invalid mutable header text"))?;
    let mut parts = header.split(' ');
    let kind = parts.next();
    if !(matches!(kind, Some("Version" | "VersionHistory" | "LaneHistory"))
        || models && matches!(kind, Some("Component" | "Lane" | "Symlink" | "ScopeMeta")))
        || parts
            .next()
            .is_none_or(|actual| !actual.eq_ignore_ascii_case(hash.trim()))
        || parts
            .next()
            .and_then(|size| size.parse::<usize>().ok())
            .is_none()
        || parts.next().is_some()
    {
        return Err(invalid("unsupported mutable identity or type"));
    }
    Ok(())
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
