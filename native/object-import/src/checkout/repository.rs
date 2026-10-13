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

pub(crate) fn source(
    directory: &Path,
    hash: [u8; 20],
    maximum: usize,
    compressed_total: &mut usize,
) -> io::Result<Vec<u8>> {
    Ok(source_record(directory, hash, maximum, compressed_total)?.body)
}

#[derive(Clone)]
pub(crate) struct SourceRecord {
    pub(crate) body: Vec<u8>,
    pub(crate) compressed: Vec<u8>,
    pub(crate) inflated_size: usize,
}
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
pub(crate) fn read_source_record(
    directory: &Path,
    hash: [u8; 20],
    maximum: usize,
    compressed_total: &mut usize,
) -> io::Result<SourceRecord> {
    let compressed = packed(directory, hash, compressed_total)?;
    let object = inflate(&compressed, maximum + 256)?;
    source_contents(compressed, &object, hash, maximum)
}

/// Independent worker reads share complete request budgets, not fixed file-size shares.
pub(crate) fn read_source_shared(
    directory: &Path,
    hash: [u8; 20],
    raw: &Budget,
    packed: &Budget,
) -> io::Result<SourceRecord> {
    let identity = crate::validate::hexadecimal(&hash);
    let file = File::open(
        directory
            .join(&identity[..2])
            .join(&identity[2..]),
    )?;
    let compressed = packed.read(file)?;
    let object = inflate_with(&compressed, MAX_BYTES + 256, Some(raw))?;
    source_contents(compressed, &object, hash, MAX_BYTES)
}

fn source_contents(
    compressed: Vec<u8>,
    object: &[u8],
    hash: [u8; 20],
    maximum: usize,
) -> io::Result<SourceRecord> {
    let (header, body) = split(object, hash, "Source")?;
    if header.parse::<usize>().is_err()
        || body.len() > maximum
        || <[u8; 20]>::from(Sha1::digest(body)) != hash
    {
        return Err(invalid("checkout Source identity or size is invalid"));
    }
    Ok(SourceRecord { body: body.to_vec(), compressed, inflated_size: object.len() })
}
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
pub(crate) fn read_shared(
    directory: &Path,
    hash: [u8; 20],
    raw: &Budget,
    packed: &Budget,
) -> io::Result<Vec<u8>> {
    let identity = crate::validate::hexadecimal(&hash);
    let compressed = packed.read(File::open(
        directory
            .join(&identity[..2])
            .join(&identity[2..]),
    )?)?;
    inflate_with(&compressed, MAX_BYTES + 256, Some(raw))
}

fn packed(directory: &Path, hash: [u8; 20], compressed_total: &mut usize) -> io::Result<Vec<u8>> {
    let identity = crate::validate::hexadecimal(&hash);
    let path = directory
        .join(&identity[..2])
        .join(&identity[2..]);
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > (MAX_BYTES - *compressed_total) as u64 {
        return Err(invalid("checkout compressed bytes out of bounds"));
    }
    let mut compressed = Vec::with_capacity(metadata.len() as usize);
    file.take((MAX_BYTES - *compressed_total + 1) as u64)
        .read_to_end(&mut compressed)?;
    *compressed_total += compressed.len();
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
fn inflate(compressed: &[u8], maximum: usize) -> io::Result<Vec<u8>> {
    inflate_with(compressed, maximum, None)
}
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
            .map_err(|_| invalid("checkout invalid compressed object"))?;
        let count = (decoder.total_out() - before_out) as usize;
        if output.len() + count > maximum {
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
        if previous + end >= 256 {
            return Err(invalid("checkout object header exceeds bounds"));
        }
        *header = Some(previous + end + 1);
        return budget.reserve(chunk.len() - end - 1);
    }
    if previous + chunk.len() >= 256 {
        return Err(invalid("checkout object header exceeds bounds"));
    }
    Ok(())
}

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
    if parts.next() != Some(kind)
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

#[cfg(test)]
mod tests;
