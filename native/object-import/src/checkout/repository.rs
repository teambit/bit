//! Loose `Source` ([`source`]) and metadata object inflation and SHA-1 verification for checkout.

pub(crate) use inflate_error::message as inflate_message;
mod inflate_error;
#[cfg(test)]
mod tests;
use std::{
    cell::RefCell,
    fs::File,
    io::{self, Read},
    path::Path,
};

use flate2::{Decompress, FlushDecompress, Status};
use sha1::{Digest, Sha1};

use super::{MAX_BYTES, invalid};
use crate::read_budget::Budget;

/// Inflate and SHA-1-verify the loose `Source` object at `hash` under `directory`.
#[inline]
pub(crate) fn source(
    directory: &Path,
    hash: [u8; 20],
    maximum: usize,
    compressed_total: &mut usize,
) -> io::Result<Vec<u8>> {
    Ok(source_record(directory, hash, maximum, compressed_total)?.body)
}

/// Verified `Source` object body along with its raw compressed bytes and inflated byte size.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SourceRecord {
    /// Verified raw `Source` payload after stripping the `<type> <hash> <size>\0` header.
    pub(crate) body: Vec<u8>,
    /// Raw zlib-compressed loose object bytes read from disk.
    pub(crate) compressed: Vec<u8>,
    /// Total inflated byte length (including the object header).
    pub(crate) inflated_size: usize,
}
/// Inflate, verify, and record the `Source` object at `hash` in the active merge receipt trace.
#[inline]
pub(crate) fn source_record(
    directory: &Path,
    hash: [u8; 20],
    maximum: usize,
    compressed_total: &mut usize,
) -> io::Result<SourceRecord> {
    let record = read_source_record(directory, hash, maximum, compressed_total)?;
    crate::merge_transaction::reads::source(hash, &record)?;
    Ok(record)
}

/// Worker reads return verified bytes without touching the caller's ordered receipt trace.
#[inline]
pub(crate) fn read_source_record(
    directory: &Path,
    hash: [u8; 20],
    maximum: usize,
    compressed_total: &mut usize,
) -> io::Result<SourceRecord> {
    let compressed = packed(directory, hash, compressed_total)?;
    let object = inflate(&compressed, maximum.saturating_add(256))?;
    source_contents(compressed, object, hash, maximum)
}

/// Independent worker reads share complete request budgets, not fixed file-size shares.
#[inline]
pub(crate) fn read_source_shared(
    directory: &Path,
    hash: [u8; 20],
    raw: &Budget,
    packed: &Budget,
) -> io::Result<SourceRecord> {
    let file = File::open(object_path(directory, hash))?;
    let compressed = packed.read(file)?;
    let object = inflate_with(&compressed, MAX_BYTES + 256, Some(raw))?;
    source_contents(compressed, object, hash, MAX_BYTES)
}

/// Validate the `<type> <hash> <size>\0` header and SHA-1 digest of `object` and return a [`SourceRecord`].
#[inline]
fn source_contents(
    compressed: Vec<u8>,
    mut object: Vec<u8>,
    hash: [u8; 20],
    maximum: usize,
) -> io::Result<SourceRecord> {
    let inflated_size = object.len();
    let header_len = {
        let (header, body) = split(&object, hash, "Source")?;
        if header.parse::<usize>().is_err()
            || body.len() > maximum
            || <[u8; 20]>::from(Sha1::digest(body)) != hash
        {
            return Err(invalid("checkout Source identity or size is invalid"));
        }
        inflated_size - body.len()
    };
    object.drain(..header_len);
    Ok(SourceRecord { body: object, compressed, inflated_size })
}
#[inline]
pub(crate) fn read(
    directory: &Path,
    hash: [u8; 20],
    maximum: usize,
    compressed_total: &mut usize,
) -> io::Result<Vec<u8>> {
    let compressed = packed(directory, hash, compressed_total)?;
    inflate(&compressed, maximum)
}

/// Read mutable repository models in parallel under one request-wide allowance.
#[inline]
pub(crate) fn read_shared(
    directory: &Path,
    hash: [u8; 20],
    raw: &Budget,
    packed: &Budget,
) -> io::Result<Vec<u8>> {
    let compressed = packed.read(File::open(object_path(directory, hash))?)?;
    inflate_with(&compressed, MAX_BYTES + 256, Some(raw))
}

#[inline]
fn object_path(directory: &Path, hash: [u8; 20]) -> std::path::PathBuf {
    let identity = crate::validate::hexadecimal(&hash);
    directory
        .join(&identity[..2])
        .join(&identity[2..])
}

#[inline]
fn packed(directory: &Path, hash: [u8; 20], compressed_total: &mut usize) -> io::Result<Vec<u8>> {
    let file = File::open(object_path(directory, hash))?;
    let metadata = file.metadata()?;
    let remaining = MAX_BYTES.saturating_sub(*compressed_total);
    if !metadata.is_file() || metadata.len() > remaining as u64 {
        return Err(invalid("checkout compressed bytes out of bounds"));
    }
    let mut compressed = Vec::with_capacity(metadata.len() as usize);
    file.take(remaining.saturating_add(1) as u64)
        .read_to_end(&mut compressed)?;
    *compressed_total = compressed_total.saturating_add(compressed.len());
    if *compressed_total > MAX_BYTES {
        return Err(invalid("checkout compressed bytes out of bounds"));
    }
    Ok(compressed)
}
struct Inflation {
    decoder: Decompress,
    chunk: Box<[u8]>,
}
thread_local! {
    static INFLATION: RefCell<Inflation> = RefCell::new(Inflation {
        decoder: Decompress::new(true),
        chunk: vec![0; 64 * 1024].into_boxed_slice(),
    });
}
#[inline]
pub(crate) fn inflate(compressed: &[u8], maximum: usize) -> io::Result<Vec<u8>> {
    inflate_with(compressed, maximum, None)
}
#[inline]
fn inflate_with(compressed: &[u8], maximum: usize, budget: Option<&Budget>) -> io::Result<Vec<u8>> {
    INFLATION.with(|inflation| {
        let Inflation { decoder, chunk } = &mut *inflation.borrow_mut();
        decoder.reset(true);
        inflate_using(compressed, maximum, decoder, chunk, budget)
    })
}
fn inflate_using(
    compressed: &[u8],
    maximum: usize,
    decoder: &mut Decompress,
    chunk: &mut [u8],
    budget: Option<&Budget>,
) -> io::Result<Vec<u8>> {
    let mut output = Vec::new();
    let mut header = None;
    loop {
        let before_in = decoder.total_in();
        let before_out = decoder.total_out();
        let status = decoder
            .decompress(&compressed[before_in as usize..], chunk, FlushDecompress::None)
            .map_err(inflate_error::retain)?;
        let count = (decoder.total_out() - before_out) as usize;
        if output.len().saturating_add(count) > maximum {
            return Err(invalid("checkout inflated bytes out of bounds"));
        }
        reserve_inflated(budget, &mut header, output.len(), &chunk[..count])?;
        output.extend_from_slice(&chunk[..count]);
        if status == Status::StreamEnd {
            break;
        }
        if decoder.total_in() == before_in && count == 0 {
            return Err(invalid("checkout truncated compressed object"));
        }
    }
    if decoder.total_in() != compressed.len() as u64 {
        return Err(invalid("checkout trailing compressed data"));
    }
    Ok(output)
}

#[inline]
fn reserve_inflated(
    budget: Option<&Budget>,
    header: &mut Option<usize>,
    previous: usize,
    chunk: &[u8],
) -> io::Result<()> {
    let Some(budget) = budget else { return Ok(()) };
    if header.is_some() {
        return budget.reserve(chunk.len());
    }
    if let Some(end) = chunk.iter().position(|byte| *byte == 0) {
        if previous.saturating_add(end) >= 256 {
            return Err(invalid("checkout object header exceeds bounds"));
        }
        *header = Some(previous.saturating_add(end).saturating_add(1));
        return budget.reserve(chunk.len() - end - 1);
    }
    if previous.saturating_add(chunk.len()) >= 256 {
        return Err(invalid("checkout object header exceeds bounds"));
    }
    Ok(())
}

#[inline]
pub(crate) fn split<'a>(
    object: &'a [u8],
    hash: [u8; 20],
    kind: &str,
) -> io::Result<(&'a str, &'a [u8])> {
    let end = object
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(|| invalid("checkout missing object header"))?;
    if end >= 256 {
        return Err(invalid("checkout object header exceeds bounds"));
    }
    let header = std::str::from_utf8(&object[..end])
        .map_err(|_| invalid("checkout object header is not UTF-8"))?;
    let mut parts = header.split(' ');
    if parts.next() != Some(kind.trim())
        || parts.next() != Some(crate::validate::hexadecimal(&hash).as_str())
    {
        return Err(invalid("checkout object header identity differs"));
    }
    let size = parts.next().ok_or_else(|| invalid("checkout missing object header size"))?;
    if parts.next().is_some() {
        return Err(invalid("checkout invalid object header"));
    }
    Ok((size, &object[end + 1..]))
}
