use flate2::{Decompress, FlushDecompress, Status};
use serde::Serialize;
use sha1::{Digest, Sha1};

const MAX_INFLATED_BYTES: usize = 1024 * 1024 * 1024;
const CHUNK_BYTES: usize = 64 * 1024;
const MAX_HEADER_BYTES: usize = 256;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Outcome {
    pub(crate) status: &'static str,
    pub(crate) hash: String,
    pub(crate) inflated_bytes: usize,
    pub(crate) reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) metadata: Option<String>,
}

pub(crate) fn hexadecimal(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    bytes
        .iter()
        .flat_map(|byte| {
            [char::from(HEX[(byte >> 4) as usize]), char::from(HEX[(byte & 15) as usize])]
        })
        .collect()
}

pub(crate) fn validate(compressed: &[u8], expected: [u8; 20]) -> Outcome {
    let hash = hexadecimal(&expected);
    match source(compressed, &hash, expected) {
        Ok(inflated_bytes) => {
            Outcome { status: "source", hash, inflated_bytes, reason: None, metadata: None }
        }
        Err(reason) => Outcome {
            status: "legacy",
            hash,
            inflated_bytes: 0,
            reason: Some(reason),
            metadata: None,
        },
    }
}

fn header(bytes: &[u8], expected: &str) -> Result<usize, &'static str> {
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .ok_or("invalid-header")?;
    if end >= MAX_HEADER_BYTES {
        return Err("header-limit");
    }
    let text = std::str::from_utf8(&bytes[..end]).map_err(|_| "invalid-header")?;
    let mut parts = text.split(' ');
    if parts.next() != Some("Source") {
        return Err("mutable-or-unknown-type");
    }
    if parts
        .next()
        .is_none_or(|actual| !actual.eq_ignore_ascii_case(expected))
    {
        return Err("header-identity");
    }
    if parts
        .next()
        .ok_or("invalid-header")?
        .parse::<usize>()
        .is_err()
        || parts.next().is_some()
    {
        return Err("invalid-header");
    }
    Ok(end + 1)
}

fn source(
    compressed: &[u8],
    expected_hex: &str,
    expected: [u8; 20],
) -> Result<usize, &'static str> {
    let mut decoder = Decompress::new(true);
    let mut digest = Sha1::new();
    let mut chunk = vec![0; CHUNK_BYTES].into_boxed_slice();
    let mut has_header = false;
    loop {
        let before_in = decoder.total_in();
        let before_out = decoder.total_out();
        let status = decoder
            .decompress(&compressed[before_in as usize..], &mut chunk, FlushDecompress::None)
            .map_err(|_| "invalid-compression")?;
        let count = decoder.total_out().saturating_sub(before_out) as usize;
        update_digest(
            &chunk[..count],
            &mut has_header,
            &mut digest,
            expected_hex,
            decoder.total_out(),
        )?;
        if status == Status::StreamEnd {
            break;
        }
        if decoder.total_in() == before_in && count == 0 {
            return Err("truncated-compression");
        }
    }
    if !has_header || <[u8; 20]>::from(digest.finalize()) != expected {
        return Err("content-identity");
    }
    if decoder.total_in() != compressed.len() as u64 {
        return Err("trailing-compressed-data");
    }
    Ok(decoder.total_out() as usize)
}

fn update_digest(
    bytes: &[u8],
    has_header: &mut bool,
    digest: &mut Sha1,
    expected_hex: &str,
    inflated_bytes: u64,
) -> Result<(), &'static str> {
    if inflated_bytes as usize > MAX_INFLATED_BYTES {
        return Err("inflated-limit");
    }
    if bytes.is_empty() {
        return Ok(());
    }
    let start = if *has_header { 0 } else { header(bytes, expected_hex)? };
    *has_header = true;
    digest.update(&bytes[start..]);
    Ok(())
}
