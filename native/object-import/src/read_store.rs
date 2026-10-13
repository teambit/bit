use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::Path,
    time::UNIX_EPOCH,
};

use flate2::{Decompress, FlushDecompress, Status};
use rayon::{ThreadPool, prelude::*};
use serde::Serialize;

use crate::{inventory, protocol, store::Store};

const MAX_RAW_BYTES: u64 = 256 * 1024;
const HEADER_INPUT_BYTES: u64 = 512;
const HEADER_BYTES: usize = 256;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Header {
    #[serde(rename = "type")]
    object_type: String,
    size: u64,
    mtime_ms: f64,
}

#[derive(Serialize)]
struct HeaderResponse {
    version: u8,
    id: u32,
    objects: Vec<Option<Header>>,
}

pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &ThreadPool,
    store: &Store,
    magic: [u8; 4],
) -> io::Result<()> {
    if magic == *b"BRC1" {
        return serve_checked(reader, writer, pool, store);
    }
    let headers = magic == *b"BHD1";
    let (id, hashes) = inventory::request(reader, if headers { 4096 } else { 128 })?;
    if headers {
        let objects = pool.install(|| {
            hashes
                .par_iter()
                .map(|hash| classify(&store.object_path(hash)))
                .collect()
        });
        return protocol::respond(writer, &HeaderResponse { version: 1, id, objects });
    }
    write_batch(writer, pool, store, id, &hashes)
}

fn serve_checked(
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &ThreadPool,
    store: &Store,
) -> io::Result<()> {
    let (id, hashes) = inventory::request(reader, 4096)?;
    if id != 1 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "invalid checked read identity"));
    }
    let sizes: Vec<_> = pool.install(|| {
        hashes
            .par_iter()
            .map(|hash| eligible_size(&store.object_path(hash)))
            .collect()
    });
    let bytes: u64 = sizes.iter().flatten().sum();
    // An empty response deliberately selects canonical reads before transferring file contents.
    if bytes > 4 * 1024 * 1024 || sizes.iter().all(Option::is_none) {
        return Ok(());
    }
    for (index, batch) in hashes.chunks(128).enumerate() {
        write_batch(writer, pool, store, index as u32 + 1, batch)?;
    }
    Ok(())
}

fn eligible_size(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    (metadata.is_file() && metadata.len() <= MAX_RAW_BYTES).then_some(metadata.len())
}

fn write_batch(
    writer: &mut impl Write,
    pool: &ThreadPool,
    store: &Store,
    id: u32,
    hashes: &[[u8; 20]],
) -> io::Result<()> {
    let objects: Vec<_> = pool.install(|| {
        hashes
            .par_iter()
            .map(|hash| read_raw(&store.object_path(hash)))
            .collect()
    });
    writer.write_all(b"BRD1")?;
    writer.write_all(&id.to_be_bytes())?;
    writer.write_all(&(hashes.len() as u32).to_be_bytes())?;
    for object in objects {
        if let Some(buffer) = object {
            writer.write_all(&[1])?;
            writer.write_all(&(buffer.len() as u32).to_be_bytes())?;
            writer.write_all(&buffer)?;
        } else {
            writer.write_all(&[0])?;
        }
    }
    writer.flush()
}

fn read_raw(path: &Path) -> Option<Vec<u8>> {
    let file = File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > MAX_RAW_BYTES {
        return None;
    }
    let mut output = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_RAW_BYTES + 1)
        .read_to_end(&mut output)
        .ok()?;
    (output.len() as u64 <= MAX_RAW_BYTES).then_some(output)
}

pub(crate) fn classify(path: &Path) -> Option<Header> {
    // Match the canonical stat-before-open ordering rather than promise an atomic snapshot.
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let mtime_ms = modified_milliseconds(metadata.modified().ok()?)?;
    let mut compressed = Vec::with_capacity(metadata.len().min(HEADER_INPUT_BYTES) as usize);
    File::open(path)
        .ok()?
        .take(HEADER_INPUT_BYTES)
        .read_to_end(&mut compressed)
        .ok()?;
    let object_type = header_type(&compressed)?;
    Some(Header { object_type, size: metadata.len(), mtime_ms })
}

fn modified_milliseconds(modified: std::time::SystemTime) -> Option<f64> {
    let elapsed = modified.duration_since(UNIX_EPOCH).ok()?;
    // Node's Windows stat binding casts seconds to unsigned long before creating Stats.
    // Avoid accepting a different timestamp after that 32-bit range wraps.
    // <https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/src/node_file-inl.h>
    if cfg!(windows) && elapsed.as_secs() > u64::from(u32::MAX) {
        return None;
    }
    Some((elapsed.as_secs() as f64).mul_add(
        1000.0,
        f64::from(elapsed.subsec_nanos()) / 1_000_000.0,
    ))
}

fn header_type(compressed: &[u8]) -> Option<String> {
    let mut decoder = Decompress::new(true);
    let mut chunk = vec![0; 64 * 1024].into_boxed_slice();
    let mut header = Vec::new();
    let mut found = false;
    loop {
        let before_in = decoder.total_in();
        let before_out = decoder.total_out();
        let status = decoder
            .decompress(&compressed[before_in as usize..], &mut chunk, FlushDecompress::None)
            .ok()?;
        let count = (decoder.total_out() - before_out) as usize;
        capture_header(&chunk[..count], &mut header, &mut found)?;
        // Drain the entire compressed prefix: corruption after the header must not become success.
        if status == Status::StreamEnd {
            break;
        }
        if decoder.total_in() == before_in && count == 0 {
            if decoder.total_in() != compressed.len() as u64 {
                return None;
            }
            break;
        }
    }
    if !found {
        return None;
    }
    let text = String::from_utf8(header).ok()?;
    let object_type = text.split(' ').next()?;
    (!object_type.is_empty()).then(|| object_type.to_owned())
}

fn capture_header(bytes: &[u8], header: &mut Vec<u8>, found: &mut bool) -> Option<()> {
    if *found {
        return Some(());
    }
    let length = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    if header.len() + length > HEADER_BYTES {
        return None;
    }
    header.extend_from_slice(&bytes[..length]);
    *found = length < bytes.len();
    Some(())
}

#[cfg(test)]
mod tests;
