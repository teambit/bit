use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

use flate2::{Decompress, FlushDecompress, Status};
use sha1::{Digest, Sha1};

use super::{MAX_BYTES, invalid};

pub(crate) fn source(
    directory: &Path,
    hash: [u8; 20],
    maximum: usize,
    compressed_total: &mut usize,
) -> io::Result<Vec<u8>> {
    let object = read(directory, hash, maximum + 256, compressed_total)?;
    let (header, body) = split(&object, hash, "Source")?;
    if header.parse::<usize>().is_err()
        || body.len() > maximum
        || <[u8; 20]>::from(Sha1::digest(body)) != hash
    {
        return Err(invalid("checkout Source identity or size is invalid"));
    }
    // Match canonical source validation: the advertised size is syntactically
    // numeric; content identity comes from the actual body, not that field.
    Ok(body.to_vec())
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
    let compressed = packed(directory, hash, compressed_total)?;
    let object = inflate(&compressed, maximum + 256)?;
    let (header, body) = split(&object, hash, "Source")?;
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
    let mut compressed = Vec::new();
    file.take((MAX_BYTES - *compressed_total + 1) as u64)
        .read_to_end(&mut compressed)?;
    *compressed_total += compressed.len();
    if *compressed_total > MAX_BYTES {
        return Err(invalid("checkout compressed bytes out of bounds"));
    }
    Ok(compressed)
}
fn inflate(compressed: &[u8], maximum: usize) -> io::Result<Vec<u8>> {
    let mut decoder = Decompress::new(true);
    let mut chunk = vec![0; 64 * 1024].into_boxed_slice();
    let mut output = Vec::new();
    loop {
        let before_in = decoder.total_in();
        let before_out = decoder.total_out();
        let status = decoder
            .decompress(&compressed[before_in as usize..], &mut chunk, FlushDecompress::None)
            .map_err(|_| invalid("checkout invalid compressed object"))?;
        let count = (decoder.total_out() - before_out) as usize;
        if output.len() + count > maximum {
            return Err(invalid("checkout inflated bytes out of bounds"));
        }
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
