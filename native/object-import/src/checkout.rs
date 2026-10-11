pub(crate) mod cache;
pub(crate) mod eol;
pub(crate) mod plan;
pub(crate) mod repository;

use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::PathBuf,
};

use serde::Serialize;

use crate::protocol;

const MAX_FILES: u32 = 64;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_PATH: usize = 32_768;

struct Input {
    hash: [u8; 20],
    destination: PathBuf,
    normalize: bool,
}
struct Request {
    id: u32,
    directory: PathBuf,
    files: Vec<Input>,
}
#[derive(Serialize)]
struct Response {
    version: u8,
    id: u32,
    completed: usize,
    skipped: Vec<usize>,
    failed: bool,
}

/// Source bodies stay entirely inside Rust. A complete source preflight precedes
/// workspace mutation, then writes retain the canonical in-place prefix semantics.
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    preflight_only: bool,
    state: &mut cache::State,
) -> io::Result<()> {
    let request = request(reader)?;
    let mut response =
        Response { version: 1, id: request.id, completed: 0, skipped: Vec::new(), failed: false };
    let Ok(contents) = preflight(&request, state, !preflight_only) else {
        response.failed = true;
        return protocol::respond(writer, &response);
    };
    if preflight_only {
        response.completed = contents.len();
        return protocol::respond(writer, &response);
    }
    let mut directories = HashSet::new();
    for (file, contents) in request.files.iter().zip(&contents) {
        if materialize(&file.destination, contents, &mut directories).is_err() {
            response.failed = true;
            break;
        }
        response.completed += 1;
    }
    protocol::respond(writer, &response)
}

fn request(reader: &mut impl Read) -> io::Result<Request> {
    let id = protocol::word(reader)?;
    let count = protocol::word(reader)?;
    if !(1..=MAX_FILES).contains(&count) {
        return Err(invalid("checkout file count out of bounds"));
    }
    let directory = path(reader)?;
    let mut files = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let mut hash = [0; 20];
        reader.read_exact(&mut hash)?;
        let destination = path(reader)?;
        if protocol::word(reader)? != 1 {
            return Err(invalid("checkout requires overwriting files"));
        }
        let normalize = match protocol::word(reader)? {
            0 => false,
            1 => true,
            _ => return Err(invalid("invalid checkout EOL policy")),
        };
        files.push(Input { hash, destination, normalize });
    }
    Ok(Request { id, directory, files })
}

pub(crate) fn path(reader: &mut impl Read) -> io::Result<PathBuf> {
    let length = protocol::word(reader)? as usize;
    if !(1..=MAX_PATH).contains(&length) {
        return Err(invalid("checkout path length out of bounds"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let name = String::from_utf8(bytes).map_err(|_| invalid("checkout path is not UTF-8"))?;
    let path = PathBuf::from(&name);
    if !path.is_absolute() || name.contains('\0') {
        return Err(invalid("checkout path must be absolute and contain no NUL"));
    }
    Ok(path)
}

fn preflight(
    request: &Request,
    state: &mut cache::State,
    use_cache: bool,
) -> io::Result<Vec<Vec<u8>>> {
    let mut inflated = 0;
    let mut compressed = 0;
    let mut files = Vec::with_capacity(request.files.len());
    for input in &request.files {
        let body = if use_cache && state.get(&request.directory, input.hash).is_some() {
            state
                .get(&request.directory, input.hash)
                .expect("checked cache entry")
                .clone()
        } else {
            let body = repository::source(
                &request.directory,
                input.hash,
                MAX_BYTES - inflated,
                &mut compressed,
            )?;
            state.insert(&request.directory, input.hash, body.clone());
            body
        };
        let contents = if input.normalize { eol::auto(body) } else { body };
        inflated += contents.len();
        if inflated > MAX_BYTES {
            return Err(invalid("checkout materialized bytes out of bounds"));
        }
        files.push(contents);
    }
    Ok(files)
}

fn materialize(
    path: &std::path::Path,
    contents: &[u8],
    directories: &mut HashSet<PathBuf>,
) -> io::Result<()> {
    if let Ok(metadata) = fs::metadata(path)
        && !metadata.is_file()
    {
        return Err(invalid("checkout target is not a regular file"));
    }
    let parent = path.parent().ok_or_else(|| invalid("checkout target has no parent"))?;
    if !directories.contains(parent) {
        fs::create_dir_all(parent)?;
        directories.insert(parent.to_path_buf());
    }
    let mut output = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;
    output.write_all(contents)
}

pub(crate) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

#[cfg(test)]
mod tests;
