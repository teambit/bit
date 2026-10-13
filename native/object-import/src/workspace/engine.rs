pub(crate) mod client_status;
pub(crate) mod diff;
pub(crate) mod inventory;
mod read;
mod read_raw;
mod scan;
mod status;

use crate::protocol;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

const MAX_INPUT: usize = 4 * 1024 * 1024;
const MAX_OUTPUT: usize = 32 * 1024 * 1024;
const MAX_RAW: usize = 8 * 1024 * 1024;
const MAX_FILES: usize = 4096;

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Request {
    StatusPrepare(client_status::Prepare),
    StatusScan(client_status::Scan),
    StatusFinish(client_status::Finish),
    StatusComplete,
    InventoryBegin(inventory::Begin),
    InventoryFinish(inventory::Finish),
    InventoryCancel {
        token: u64,
    },
    Scan {
        root: PathBuf,
        exclude_dirs: Vec<PathBuf>,
        workspace_root: bool,
    },
    Read {
        files: Vec<PathBuf>,
        #[serde(default)]
        binary: bool,
        #[serde(default)]
        retain: bool,
    },
    Diff {
        files: Vec<diff::InputFile>,
        git_executable: String,
        color: bool,
    },
    FileStatus {
        target: Vec<status::File>,
        current: Vec<status::File>,
    },
    Compare {
        left: String,
        right: String,
    },
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
        if self.0.len() + bytes.len() > MAX_OUTPUT {
            return Err(invalid("workspace output limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Read-only workspace operations return no partial results on unsupported data.
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &rayon::ThreadPool,
    snapshots: &mut super::snapshots::State,
) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if length == 0 || length > MAX_INPUT {
        return Err(invalid("workspace input limit"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let request = serde_json::from_slice(&bytes).map_err(|_| invalid("workspace invalid request"));
    if let Ok(Request::Read { files, binary: true, retain }) = &request {
        return read_raw::respond(id, files, pool, writer, retain.then_some(snapshots));
    }
    let result = request.and_then(|request| owned(request, snapshots, pool));
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
fn owned(
    request: Request,
    snapshots: &mut super::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::StatusPrepare(input) => client_status::prepare(input, &mut snapshots.status),
        Request::StatusScan(input) => client_status::scan(&input, &mut snapshots.status, pool),
        Request::StatusFinish(input) => client_status::finish(&input, &mut snapshots.status, pool),
        Request::StatusComplete => client_status::complete(&mut snapshots.status),
        Request::InventoryBegin(input) => inventory::begin(input, &mut snapshots.inventory, pool),
        Request::InventoryFinish(input) => inventory::finish(input, &mut snapshots.inventory, pool),
        Request::InventoryCancel { token } => inventory::cancel(token, &mut snapshots.inventory),
        request => apply(request, pool),
    }
}
fn failure(id: u32) -> Response {
    Response { version: 1, id, completed: 0, skipped: Vec::new(), failed: true, data: None }
}
fn apply(request: Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    match request {
        Request::StatusPrepare(_)
        | Request::StatusScan(_)
        | Request::StatusFinish(_)
        | Request::StatusComplete
        | Request::InventoryBegin(_)
        | Request::InventoryFinish(_)
        | Request::InventoryCancel { .. } => Err(invalid("inventory operation requires an owner")),
        Request::Scan { root, exclude_dirs, workspace_root } => {
            let paths = scan::scan(&root, &exclude_dirs, workspace_root)?;
            Ok((paths.len(), json!({"paths":paths})))
        }
        Request::Read { files, .. } => {
            let files = read::read(&files, pool)?;
            Ok((files.len(), json!({"files":files})))
        }
        Request::Diff { files, git_executable, color } => {
            let files = pool.install(|| diff::diff(&files, &git_executable, color))?;
            Ok((files.len(), json!({"files":files})))
        }
        Request::FileStatus { target, current } => status::compare(&target, &current),
        Request::Compare { left, right } => Ok((
            1,
            json!({"modified":Sha1::digest(left.as_bytes())!=Sha1::digest(right.as_bytes())}),
        )),
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn path(path: &Path) -> io::Result<()> {
    let name = path.to_str().ok_or_else(|| invalid("workspace non-UTF8 path"))?;
    if !path.is_absolute() || name.len() > 32768 || name.contains('\0') {
        return Err(invalid("workspace invalid absolute path"));
    }
    Ok(())
}
fn count(count: usize) -> io::Result<()> {
    if count > MAX_FILES { Err(invalid("workspace file count limit")) } else { Ok(()) }
}
fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
fn expected_hash(hash: &str) -> io::Result<[u8; 20]> {
    if hash.len() != 40
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("workspace invalid hash"));
    }
    let mut output = [0; 20];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hash[index * 2..index * 2 + 2], 16)
            .map_err(|_| invalid("workspace invalid hash"))?;
    }
    Ok(output)
}
#[cfg(test)]
mod tests;
