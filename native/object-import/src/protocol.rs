//! Four-byte magic-header frame routing ([`serve_extension`], [`serve_workspace`], [`word`], [`respond`], [`MAX_BATCH_BYTES`]) for workspace session extensions.

use rayon::ThreadPool;
use serde::Serialize;
use std::io::{self, Read, Write};

/// Maximum serialized byte size (128 MiB) permitted for a single session protocol frame.
pub(crate) const MAX_BATCH_BYTES: usize = 128 * 1024 * 1024;

/// Reads a big-endian `u32` frame word from `reader`.
#[inline]
pub(crate) fn word(reader: &mut impl Read) -> io::Result<u32> {
    let mut bytes = [0; 4];
    reader.read_exact(&mut bytes)?;
    Ok(u32::from_be_bytes(bytes))
}

/// Serializes `response` as a newline-terminated JSON frame into `writer` within [`MAX_BATCH_BYTES`].
pub(crate) fn respond(writer: &mut impl Write, response: &impl Serialize) -> io::Result<()> {
    let mut bytes = Vec::with_capacity(128);
    serde_json::to_writer(&mut bytes, response).map_err(io::Error::other)?;
    if bytes.len() > MAX_BATCH_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "response exceeds frame limit"));
    }
    bytes.push(b'\n');
    writer.write_all(&bytes)?;
    writer.flush()
}

/// Dispatches a 4-byte `magic` protocol frame to the matching workspace, checkout, merge, or snapshot service.
pub(crate) fn serve_extension(
    magic: [u8; 4],
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &ThreadPool,
    checkout: &mut crate::checkout::cache::State,
    merge: &mut crate::merge_state::State,
) -> io::Result<bool> {
    match &magic {
        b"BMT1" => crate::merge_state::serve(reader, writer, merge, pool)?,
        b"BMH1" => crate::merge_history::serve(reader, writer, pool)?,
        b"BSS1" => crate::snapshot::serve(reader, writer)?,
        b"BWS1" => crate::workspace::engine::serve(
            reader,
            writer,
            pool,
            &mut merge.operations.workspace_reads,
        )?,
        b"BCK1" => crate::checkout::plan::serve(reader, writer, checkout)?,
        b"BWC2" => crate::checkout::read_sources(reader, writer, checkout, pool)?,
        b"BWC0" | b"BWC1" => {
            let legacy = magic == *b"BWC0";
            crate::checkout::serve(reader, writer, legacy, checkout, pool)?;
        }
        _ => return serve_workspace(magic, reader, writer),
    }
    Ok(true)
}

/// Dispatches a workspace-only 4-byte `magic` frame (`BWM1` or `BWP1`), returning `Ok(false)` when unrecognized.
#[inline]
fn serve_workspace(
    magic: [u8; 4],
    reader: &mut impl Read,
    writer: &mut impl Write,
) -> io::Result<bool> {
    match &magic {
        b"BWM1" => crate::workspace::serve(reader, writer)?,
        b"BWP1" => crate::workspace::actions::serve(reader, writer)?,
        _ => return Ok(false),
    }
    Ok(true)
}
