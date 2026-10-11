use std::io::{self, Read, Write};

use rayon::{ThreadPool, prelude::*};
use serde::Serialize;

use crate::{
    store::Store,
    validate::{Outcome, validate, validate_with_metadata},
};

pub(crate) const MAX_BATCH_BYTES: usize = 128 * 1024 * 1024;
const MAX_FILES: u32 = 16;

struct Input {
    expected: [u8; 20],
    compressed: Vec<u8>,
}

#[derive(Serialize)]
struct Response {
    version: u8,
    id: u32,
    files: Vec<Outcome>,
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

pub(crate) fn word(reader: &mut impl Read) -> io::Result<u32> {
    let mut bytes = [0; 4];
    reader.read_exact(&mut bytes)?;
    Ok(u32::from_be_bytes(bytes))
}

fn batch(reader: &mut impl Read, count: u32) -> io::Result<Vec<Input>> {
    if !(1..=MAX_FILES).contains(&count) {
        return Err(invalid("batch count out of bounds"));
    }
    let mut inputs = Vec::new();
    let mut total = 0;
    for _ in 0..count {
        let mut expected = [0; 20];
        reader.read_exact(&mut expected)?;
        let length = word(reader)? as usize;
        total += length;
        if length == 0 || total > MAX_BATCH_BYTES {
            return Err(invalid("compressed batch bytes out of bounds"));
        }
        let mut compressed = Vec::new();
        compressed
            .try_reserve_exact(length)
            .map_err(|_| invalid("unable to reserve compressed input"))?;
        compressed.resize(length, 0);
        reader.read_exact(&mut compressed)?;
        inputs.push(Input { expected, compressed });
    }
    Ok(inputs)
}

pub(crate) fn serve_with_store(
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &ThreadPool,
    store: Option<&Store>,
) -> io::Result<()> {
    loop {
        let mut magic = [0; 4];
        // Clean EOF is valid; a partial frame must never produce partial success.
        if reader.read(&mut magic[..1])? == 0 {
            return Ok(());
        }
        reader.read_exact(&mut magic[1..])?;
        if serve_extension(magic, reader, writer, pool, store)? {
            continue;
        }
        let version = frame_version(magic, store)?;
        let id = word(reader)?;
        let count = word(reader)?;
        let inputs = batch(reader, count)?;
        let files = outcomes(&inputs, pool, version);
        respond(writer, &Response { version, id, files: files.clone() })?;
        if version > 1 {
            commit(
                reader,
                writer,
                pool,
                store.ok_or_else(|| invalid("missing native store"))?,
                (version, id),
                &inputs,
                &files,
            )?;
        }
    }
}

#[cfg(test)]
mod tests;

#[derive(Serialize)]
struct CommitResponse {
    version: u8,
    id: u32,
    persisted: Vec<u32>,
    failed: Vec<u32>,
}

fn commit(
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &ThreadPool,
    store: &Store,
    identity: (u8, u32),
    inputs: &[Input],
    files: &[Outcome],
) -> io::Result<()> {
    let (version, id) = identity;
    let indices = selection(reader, id, files, version)?;
    let outcomes: Vec<_> = pool.install(|| {
        indices
            .par_iter()
            .map(|index| {
                let offset = *index as usize;
                (
                    *index,
                    store
                        .write(&files[offset].hash, &inputs[offset].compressed)
                        .is_ok(),
                )
            })
            .collect()
    });
    store.finish_batch()?;
    let response = CommitResponse {
        version,
        id,
        persisted: outcomes
            .iter()
            .filter_map(|(index, success)| success.then_some(*index))
            .collect(),
        failed: outcomes
            .iter()
            .filter_map(|(index, success)| (!success).then_some(*index))
            .collect(),
    };
    respond(writer, &response)
}

fn selection(
    reader: &mut impl Read,
    id: u32,
    files: &[Outcome],
    version: u8,
) -> io::Result<Vec<u32>> {
    let mut magic = [0; 4];
    reader.read_exact(&mut magic)?;
    if magic != (if version == 3 { *b"BOC3" } else { *b"BOC2" }) || word(reader)? != id {
        return Err(invalid("invalid Source commit identity"));
    }
    let count = word(reader)?;
    if count as usize > files.len() {
        return Err(invalid("invalid Source commit count"));
    }
    let mut indices = Vec::new();
    for _ in 0..count {
        let index = word(reader)?;
        if index as usize >= files.len()
            || files[index as usize].status != "source"
            || indices.contains(&index)
        {
            return Err(invalid("invalid Source commit selection"));
        }
        indices.push(index);
    }
    Ok(indices)
}

fn frame_version(magic: [u8; 4], store: Option<&Store>) -> io::Result<u8> {
    match (&magic, store) {
        (b"BOI1", _) => Ok(1),
        (b"BOI2", Some(_)) => Ok(2),
        (b"BOI3", Some(_)) => Ok(3),
        _ => Err(invalid("unsupported object-import protocol")),
    }
}

pub(crate) fn respond(writer: &mut impl Write, response: &impl Serialize) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, response)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

fn outcomes(inputs: &[Input], pool: &ThreadPool, version: u8) -> Vec<Outcome> {
    pool.install(|| {
        inputs
            .par_iter()
            .map(|input| {
                if version == 3 {
                    validate_with_metadata(&input.compressed, input.expected)
                } else {
                    validate(&input.compressed, input.expected)
                }
            })
            .collect()
    })
}

fn serve_read_only(
    magic: [u8; 4],
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &ThreadPool,
    store: Option<&Store>,
) -> io::Result<bool> {
    if !matches!(&magic, b"BEX1" | b"BHD1" | b"BRD1" | b"BRC1" | b"BWR1" | b"BWD1") {
        return Ok(false);
    }
    let store = store.ok_or_else(|| invalid("missing read-only store"))?;
    if magic == *b"BWR1" || magic == *b"BWD1" {
        crate::directory::serve(reader, writer, pool, store, magic == *b"BWD1")?;
    } else if magic == *b"BEX1" {
        crate::inventory::serve(reader, writer, pool, store)?;
    } else {
        crate::read_store::serve(reader, writer, pool, store, magic)?;
    }
    Ok(true)
}

fn serve_extension(
    magic: [u8; 4],
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &ThreadPool,
    store: Option<&Store>,
) -> io::Result<bool> {
    match magic {
        value if value == *b"BWM1" => crate::workspace::serve(reader, writer)?,
        value if value == *b"BOP1" => crate::operation::serve(reader, writer, store)?,
        value if value == *b"BSP1" => crate::operation::spool(reader, writer, store)?,
        value if value == *b"BTI1" => crate::tar_batch::serve(reader, writer, pool, store, false)?,
        value if value == *b"BTI2" => crate::tar_batch::serve(reader, writer, pool, store, true)?,
        value if value == *b"BMS1" => {
            crate::mutable_store::serve_sequential(reader, writer, store)?;
        }
        value if value == *b"BMP1" => crate::mutable_store::serve(reader, writer, pool, store)?,
        _ => return serve_read_only(magic, reader, writer, pool, store),
    }
    Ok(true)
}
