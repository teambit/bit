pub(crate) mod merge;
pub(crate) mod metadata;
pub(crate) mod status;

mod graph;
#[cfg(test)]
mod tests;
use crate::protocol;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    io::{self, Read, Write},
    path::Path,
};
const MAX_INPUT: usize = 4 * 1024 * 1024;
const MAX_RAW: usize = 32 * 1024 * 1024;
const MAX_FILES: usize = 4096;

/// Read a bounded Version ancestry graph for native repository planning.
pub(crate) fn read_graph(objects: &Path, heads: &[String]) -> io::Result<Value> {
    let request = serde_json::from_value(serde_json::json!({
        "objectsDirectory":objects,"heads":heads,"cached":[],"overlay":[],
    }))
    .map_err(io::Error::other)?;
    graph::load(&request).map(|value| value["versions"].clone())
}
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Request {
    Graph(graph::Load),
    Diverge {
        versions: Vec<graph::Version>,
        source_head: String,
        target_head: String,
        unmerged_unrelated: bool,
    },
    MergeFiles(merge::Request),
}
#[derive(Serialize)]
struct Response {
    version: u8,
    id: u32,
    completed: usize,
    skipped: Vec<usize>,
    failed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}
struct Output(Vec<u8>);
impl Write for Output {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len().saturating_add(bytes.len()) > MAX_RAW {
            return Err(invalid("history output limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &rayon::ThreadPool,
) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if length == 0 || length > MAX_INPUT {
        return Err(invalid("history input limit"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let result = serde_json::from_slice(&bytes)
        .map_err(io::Error::other)
        .and_then(|request| pool.install(|| apply(request)));
    let response = match result {
        Ok((completed, data)) => Response {
            version: 1,
            id,
            completed,
            skipped: Vec::new(),
            failed: false,
            data: Some(data),
        },
        Err(_) => failure(id),
    };
    let mut output = Output(Vec::new());
    if serde_json::to_writer(&mut output, &response).is_err() {
        return protocol::respond(writer, &failure(id));
    }
    writer.write_all(&output.0)?;
    writer.write_all(b"\n")?;
    writer.flush()
}
fn failure(id: u32) -> Response {
    Response { version: 1, id, completed: 0, skipped: Vec::new(), failed: true, data: None }
}
fn apply(request: Request) -> io::Result<(usize, Value)> {
    match request {
        Request::Graph(load) => Ok((1, graph::load(&load)?)),
        Request::Diverge {
            versions,
            source_head,
            target_head,
            unmerged_unrelated,
        } => Ok((1, graph::diverge(&versions, &source_head, &target_head, unmerged_unrelated)?)),
        Request::MergeFiles(request) => Ok((1, merge::merge(&request)?)),
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn count(count: usize) -> io::Result<()> {
    if count > MAX_FILES { Err(invalid("history count limit")) } else { Ok(()) }
}
pub(crate) fn path(path: &Path) -> io::Result<()> {
    if !path.is_absolute()
        || path
            .to_str()
            .is_none_or(|name| name.len() > 32768 || name.contains('\0'))
    {
        Err(invalid("history absolute path required"))
    } else {
        Ok(())
    }
}
pub(crate) fn hash(hash: &str) -> io::Result<[u8; 20]> {
    if hash.len() != 40
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("history invalid hash"));
    }
    let mut bytes = [0; 20];
    for (index, pair) in hash
        .as_bytes()
        .chunks_exact(2)
        .enumerate()
    {
        let digit = |byte: u8| if byte <= b'9' { byte - b'0' } else { byte - b'a' + 10 };
        bytes[index] = digit(pair[0]) * 16 + digit(pair[1]);
    }
    Ok(bytes)
}
