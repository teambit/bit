//! Complete read-only Source loads: return verified raw bodies and canonical cache weights.
//!
//! Streams verified `Source` object contents ([`Record`]) over the helper framing protocol into [`Output`].
use super::{MAX_BYTES, Request, Response, cache, invalid, repository, request};
use crate::read_budget::Budget;
use rayon::{ThreadPool, prelude::*};
use serde::Serialize;
use std::io::{self, Read, Write};

/// Verified `Source` object payload along with its compressed and inflated byte sizes.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Record {
    /// Verified raw `Source` object body bytes.
    body: Vec<u8>,
    /// Compressed loose object byte size on disk.
    compressed: usize,
    /// Total inflated loose object byte size.
    inflated: usize,
}
/// Framed response payload summarizing total binary bytes and per-file `[offset, len, compressed, inflated]` spans.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    #[serde(flatten)]
    response: Response,
    binary_bytes: usize,
    data: Vec<Option<[usize; 4]>>,
}
/// Read an uncached `Source` [`Record`] for `input` from [`cache::State`] or disk via [`repository::read_source_record`] within `remaining_raw` and `compressed` budgets.
#[inline]
fn read(
    request: &Request,
    input: &super::Input,
    state: &cache::State,
    remaining_raw: usize,
    compressed: &mut usize,
) -> io::Result<Option<Record>> {
    if input.cached(request, state, false).is_some() {
        return Ok(None);
    }
    let source =
        repository::read_source_record(&request.directory, input.hash, remaining_raw, compressed)?;
    Ok(Some(Record {
        body: source.body,
        compressed: source.compressed.len(),
        inflated: source.inflated_size,
    }))
}
/// Read uncached `Source` [`Record`]s for [`Request`] `request` in parallel on `pool` under shared [`MAX_BYTES`] [`Budget`]s.
fn records(
    request: &Request,
    state: &cache::State,
    pool: &ThreadPool,
) -> io::Result<Vec<Option<Record>>> {
    let raw = Budget::new(MAX_BYTES);
    let packed = Budget::new(MAX_BYTES);
    pool.install(|| {
        request.files
            .par_iter()
            .map(|input| {
                if input.cached(request, state, false).is_some() {
                    return Ok(None);
                }
                let source =
                    repository::read_source_shared(&request.directory, input.hash, &raw, &packed)?;
                Ok(Some(Record {
                    compressed: source.compressed.len(),
                    inflated: source.inflated_size,
                    body: source.body,
                }))
            })
            .collect()
    })
}
/// Read uncached `Source` [`Record`]s for `request` sequentially within [`MAX_BYTES`] budgets.
#[inline]
fn serial_records(request: &Request, state: &cache::State) -> io::Result<Vec<Option<Record>>> {
    let mut raw = 0_usize;
    let mut compressed = 0_usize;
    request.files
        .iter()
        .map(|input| {
            let record =
                read(request, input, state, MAX_BYTES.saturating_sub(raw), &mut compressed)?;
            if let Some(source) = &record {
                raw = raw.saturating_add(source.body.len());
            }
            Ok(record)
        })
        .collect()
}
#[inline]
fn response(request: &Request, records: &[Option<Record>]) -> Output {
    let mut binary_bytes = 0_usize;
    let data = records
        .iter()
        .map(|record| {
            let record = record.as_ref()?;
            let offset = binary_bytes;
            binary_bytes = binary_bytes.saturating_add(record.body.len());
            Some([offset, record.body.len(), record.compressed, record.inflated])
        })
        .collect();
    Output {
        response: Response {
            version: 1,
            id: request.id,
            completed: records.len(),
            skipped: Vec::new(),
            failed: false,
        },
        binary_bytes,
        data,
    }
}
fn prepare(request: &Request, state: &mut cache::State, pool: &ThreadPool) -> io::Result<Vec<u8>> {
    if request.files.iter().any(|input| input.normalize) {
        return Err(invalid("Source reads require original bytes"));
    }
    let records = load_records(request, state, pool)?;
    let metadata = response(request, &records);
    let mut output = Vec::with_capacity(64 + records.len() * 32);
    serde_json::to_writer(&mut output, &metadata)?;
    output.push(b'\n');
    if output.len() > 65536 || metadata.binary_bytes > MAX_BYTES {
        return Err(invalid("Source read response exceeds bounds"));
    }
    output
        .try_reserve_exact(metadata.binary_bytes)
        .map_err(|_| invalid("Source read allocation limit"))?;
    for (input, record) in request.files.iter().zip(records) {
        if let Some(record) = record {
            output.extend_from_slice(&record.body);
            if state.get(&request.directory, input.hash).is_none() {
                state.insert(&request.directory, input.hash, record.body);
            }
        }
    }
    Ok(output)
}

#[inline]
fn load_records(
    request: &Request,
    state: &cache::State,
    pool: &ThreadPool,
) -> io::Result<Vec<Option<Record>>> {
    if request.files.len() >= 32 && pool.current_num_threads() > 1 {
        records(request, state, pool).or_else(|_| serial_records(request, state))
    } else {
        serial_records(request, state)
    }
}
/// Prepare the complete bounded response before ACK; this operation never writes workspace files.
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    state: &mut cache::State,
    pool: &ThreadPool,
) -> io::Result<()> {
    let request = request(reader, 256)?;
    match prepare(&request, state, pool) {
        Ok(output) => {
            writer.write_all(&output)?;
            writer.flush()
        }
        Err(_) => crate::protocol::respond(
            writer,
            &Response {
                version: 1,
                id: request.id,
                completed: 0,
                skipped: Vec::new(),
                failed: true,
            },
        ),
    }
}
