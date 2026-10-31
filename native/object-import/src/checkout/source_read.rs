//! Complete read-only Source loads: return verified raw bodies and canonical cache weights.
use super::{MAX_BYTES, Request, Response, cache, invalid, repository, request};
use crate::read_budget::Budget;
use rayon::{ThreadPool, prelude::*};
use serde::Serialize;
use std::io::{self, Read, Write};

struct Record {
    body: Vec<u8>,
    compressed: usize,
    inflated: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    #[serde(flatten)]
    response: Response,
    binary_bytes: usize,
    data: Vec<Option<[usize; 4]>>,
}
fn read(
    request: &Request,
    input: &super::Input,
    state: &cache::State,
    budget: (usize, usize),
) -> io::Result<Option<Record>> {
    if input.cached(request, state, false).is_some() {
        return Ok(None);
    }
    let mut compressed = MAX_BYTES.saturating_sub(budget.1);
    let source =
        repository::read_source_record(&request.directory, input.hash, budget.0, &mut compressed)?;
    Ok(Some(Record {
        body: source.body,
        compressed: source.compressed.len(),
        inflated: source.inflated_size,
    }))
}
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
fn serial_records(request: &Request, state: &cache::State) -> io::Result<Vec<Option<Record>>> {
    let mut raw = 0_usize;
    let mut compressed = 0_usize;
    request.files
        .iter()
        .map(|input| {
            let record = read(
                request,
                input,
                state,
                (MAX_BYTES.saturating_sub(raw), MAX_BYTES.saturating_sub(compressed)),
            )?;
            if let Some(source) = &record {
                raw = raw.saturating_add(source.body.len());
                compressed = compressed.saturating_add(source.compressed);
            }
            Ok(record)
        })
        .collect()
}
fn response(request: &Request, records: &[Option<Record>]) -> Output {
    let mut binary_bytes = 0_usize;
    let data = records
        .iter()
        .map(|record| {
            record
                .as_ref()
                .map(|record| {
                    let offset = binary_bytes;
                    binary_bytes = binary_bytes.saturating_add(record.body.len());
                    [offset, record.body.len(), record.compressed, record.inflated]
                })
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
    let records = records(request, state, pool).or_else(|_| serial_records(request, state))?;
    let metadata = response(request, &records);
    let mut output = serde_json::to_vec(&metadata)?;
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
            state.insert(&request.directory, input.hash, record.body);
        }
    }
    Ok(output)
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
