//! The frames a workspace session serves (`WorkspaceSession::request`):
//! each request names its handler with four magic bytes.

use std::io::{self, Read, Write};

use rayon::ThreadPool;
use serde::Serialize;

pub(crate) const MAX_BATCH_BYTES: usize = 128 * 1024 * 1024;

pub(crate) fn word(reader: &mut impl Read) -> io::Result<u32> {
    let mut bytes = [0; 4];
    reader.read_exact(&mut bytes)?;
    Ok(u32::from_be_bytes(bytes))
}

pub(crate) fn respond(writer: &mut impl Write, response: &impl Serialize) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, response)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

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
