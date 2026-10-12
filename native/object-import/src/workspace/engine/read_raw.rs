use super::{MAX_OUTPUT, Output, failure, invalid, read};
use rayon::ThreadPool;
use serde::Serialize;
use std::{
    io::{self, Write},
    path::{Path, PathBuf},
};

#[derive(Serialize)]
struct Record {
    #[serde(flatten)]
    metadata: read::Metadata,
    offset: usize,
    bytes: usize,
    #[serde(skip)]
    body: Vec<u8>,
}
#[derive(Serialize)]
struct Data<'a> {
    files: &'a [Record],
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Response<'a> {
    version: u8,
    id: u32,
    completed: usize,
    skipped: [usize; 0],
    failed: bool,
    binary_bytes: usize,
    data: Data<'a>,
}
fn record(file: &Path, raw: Vec<u8>) -> Record {
    let (metadata, body) = read::canonical(file, raw);
    Record { metadata, offset: 0, bytes: body.len(), body }
}
fn prepare(id: u32, files: &[PathBuf], pool: &ThreadPool) -> io::Result<Output> {
    let mut files = read::read_with(files, pool, record)?;
    let mut bytes = 0;
    for file in &mut files {
        file.offset = bytes;
        bytes += file.bytes;
    }
    let response = Response {
        version: 1,
        id,
        completed: files.len(),
        skipped: [],
        failed: false,
        binary_bytes: bytes,
        data: Data { files: &files },
    };
    let mut output = Output(Vec::new());
    serde_json::to_writer(&mut output, &response)?;
    output.write_all(b"\n")?;
    if output.0.len() + bytes > MAX_OUTPUT {
        return Err(invalid("workspace output limit"));
    }
    output.0.try_reserve_exact(bytes).map_err(|_| invalid("workspace allocation limit"))?;
    for file in files {
        output.write_all(&file.body)?;
    }
    Ok(output)
}
/// Header and bounded raw payload are fully prepared before acknowledging any files.
pub(super) fn respond(
    id: u32,
    files: &[PathBuf],
    pool: &ThreadPool,
    writer: &mut impl Write,
) -> io::Result<()> {
    match prepare(id, files, pool) {
        Ok(output) => {
            writer.write_all(&output.0)?;
            writer.flush()
        }
        Err(_) => crate::protocol::respond(writer, &failure(id)),
    }
}
