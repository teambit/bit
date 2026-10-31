mod commit;
mod policy;

use crate::{protocol, store::Store};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

const MAX_JSON: usize = 4 * 1024 * 1024;
const MAX_RAW: usize = 32 * 1024 * 1024;
const MAX_FILES: usize = 4096;
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Request {
    Commit { objects_directory: PathBuf, owner: Option<Owner>, objects: Vec<commit::Object> },
    Plan(policy::Plan),
    Index { components: Vec<Value>, lanes: Vec<Value>, objects: Vec<Value> },
    IndexWrite { objects_directory: PathBuf, owner: Option<Owner>, contents: String },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Owner {
    uid: u32,
    gid: u32,
}
impl Owner {
    fn pair(owner: Option<Self>) -> Option<(u32, u32)> {
        owner.map(|owner| (owner.uid, owner.gid))
    }
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
impl Response {
    fn success(id: u32, completed: usize, data: Value) -> Self {
        Self { version: 1, id, completed, skipped: Vec::new(), failed: false, data: Some(data) }
    }
    fn failure(id: u32) -> Self {
        Self { version: 1, id, completed: 0, skipped: Vec::new(), failed: true, data: None }
    }
}
/// Snapshot operations validate complete inputs before mutating repository files.
pub(crate) fn serve(reader: &mut impl Read, writer: &mut impl Write) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if length == 0 || length > MAX_JSON {
        return Err(invalid("snapshot request limit"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let response = serde_json::from_slice(&bytes)
        .map_err(|_| invalid("snapshot invalid request"))
        .and_then(|request| apply(id, request))
        .unwrap_or_else(|_| Response::failure(id));
    let output = serde_json::to_vec(&response).map_err(io::Error::other)?;
    if output.len() > MAX_JSON {
        return protocol::respond(writer, &Response::failure(id));
    }
    writer.write_all(&output)?;
    writer.write_all(b"\n")?;
    writer.flush()
}
fn apply(id: u32, request: Request) -> io::Result<Response> {
    match request {
        Request::Commit { objects_directory, owner, objects } => {
            commit::commit(id, &objects_directory, Owner::pair(owner), &objects)
        }
        Request::Plan(plan) => Ok(Response::success(id, 1, policy::plan(&plan)?)),
        Request::Index { components, lanes, objects } => {
            count(components.len())?;
            count(lanes.len())?;
            count(objects.len())?;
            let actions = crate::operation::project_index(
                json!({"components":components,"lanes":lanes,"objects":objects}),
            )?;
            Ok(Response::success(id, 1, json!({"actions":actions})))
        }
        Request::IndexWrite { objects_directory, owner, contents } => {
            path(&objects_directory)?;
            if !crate::parse_jsonc(contents.as_bytes()).is_ok_and(|value| value.is_object()) {
                return Err(invalid("snapshot invalid index JSON"));
            }
            let store = Store::new(objects_directory, Owner::pair(owner))?;
            store.write_index(contents.as_bytes())?;
            Ok(Response::success(id, 1, json!({"saved":true})))
        }
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn count(count: usize) -> io::Result<()> {
    if count > MAX_FILES { Err(invalid("snapshot object count limit")) } else { Ok(()) }
}
fn path(path: &Path) -> io::Result<()> {
    let name = path.to_str().ok_or_else(|| invalid("snapshot non-UTF8 path"))?;
    if !path.is_absolute() || name.len() > 32768 || name.contains('\0') {
        return Err(invalid("snapshot invalid absolute path"));
    }
    Ok(())
}
fn hash(hash: &str) -> io::Result<()> {
    if hash.len() != 40
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("snapshot invalid hash"));
    }
    Ok(())
}
#[cfg(test)]
mod tests;
