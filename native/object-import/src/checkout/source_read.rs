//! Complete read-only Source loads: return verified raw bodies and canonical cache weights.
use super::{MAX_BYTES, Request, Response, cache, invalid, repository, request};
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
    let mut compressed = MAX_BYTES - budget.1;
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
    width: usize,
) -> io::Result<Vec<Option<Record>>> {
    let mut output = Vec::with_capacity(request.files.len());
    let mut raw = 0;
    let mut compressed = 0;
    for files in request.files.chunks(width) {
        let budget = ((MAX_BYTES - raw) / files.len(), (MAX_BYTES - compressed) / files.len());
        let batch = pool.install(|| {
            files
                .par_iter()
                .map(|input| read(request, input, state, budget))
                .collect::<io::Result<Vec<_>>>()
        })?;
        for record in batch {
            if let Some(source) = &record {
                raw += source.body.len();
                compressed += source.compressed;
            }
            output.push(record);
        }
    }
    Ok(output)
}
fn response(request: &Request, records: &[Option<Record>]) -> Output {
    let mut binary_bytes = 0;
    let data = records
        .iter()
        .map(|record| {
            record
                .as_ref()
                .map(|record| {
                    let offset = binary_bytes;
                    binary_bytes += record.body.len();
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
    let records = records(request, state, pool, 64)
        .or_else(|_| records(request, state, pool, pool.current_num_threads()))
        .or_else(|_| records(request, state, pool, 1))?;
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
