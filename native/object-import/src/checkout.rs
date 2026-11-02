//! Bounded checkout source reading ([`read_sources`]), [`eol`] normalization, and atomic workspace file writing.

pub(crate) mod cache;
pub(crate) mod eol;
pub(crate) mod plan;
pub(crate) mod repository;

pub(crate) use source_read::serve as read_sources;

mod preflight;
mod source_read;
#[cfg(test)]
mod tests;

use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::PathBuf,
};

use serde::Serialize;

use crate::protocol;

/// Maximum number of files (`64`) accepted in a single checkout write batch.
const MAX_FILES: u32 = 64;
/// Maximum total byte budget (`32 MiB`) for a single checkout batch.
const MAX_BYTES: usize = 32 * 1024 * 1024;
/// Maximum destination path byte length (`32 KiB`) accepted in a checkout batch.
const MAX_PATH: usize = 32_768;

/// Single file checkout entry pairing a 20-byte `Source` SHA-1 hash with its workspace destination.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Input {
    /// Raw 20-byte SHA-1 digest of the `Source` object.
    hash: [u8; 20],
    /// Absolute destination path in the workspace.
    destination: PathBuf,
    /// Whether to apply platform EOL normalization before writing.
    normalize: bool,
    /// Whether to consult [`cache::State`] even on preflight-only reads.
    prefer_cached: bool,
}
impl Input {
    /// Look up `self.hash` in `state` when `use_cache` or `self.prefer_cached` is enabled.
    #[inline]
    fn cached<'a>(
        &self,
        request: &Request,
        state: &'a cache::State,
        use_cache: bool,
    ) -> Option<&'a Vec<u8>> {
        (use_cache || self.prefer_cached)
            .then(|| state.get(&request.directory, self.hash))
            .flatten()
    }
}
/// Decoded binary checkout or source-read request header and file list.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Request {
    id: u32,
    directory: PathBuf,
    files: Vec<Input>,
}
/// Serialized checkout batch completion status and failure summary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
    pool: &rayon::ThreadPool,
) -> io::Result<()> {
    let request = request(reader, if preflight_only { 256 } else { MAX_FILES })?;
    let mut response =
        Response { version: 1, id: request.id, completed: 0, skipped: Vec::new(), failed: false };
    let Ok(contents) = preflight::load(&request, state, !preflight_only, pool) else {
        response.failed = true;
        return protocol::respond(writer, &response);
    };
    if preflight_only {
        response.completed = contents.len();
        return protocol::respond(writer, &response);
    }
    let mut directories = HashSet::with_capacity(request.files.len());
    for (file, contents) in request.files.iter().zip(&contents) {
        if materialize(&file.destination, contents, &mut directories).is_err() {
            response.failed = true;
            break;
        }
        response.completed += 1;
    }
    protocol::respond(writer, &response)
}

fn request(reader: &mut impl Read, maximum_files: u32) -> io::Result<Request> {
    let id = protocol::word(reader)?;
    let count = protocol::word(reader)?;
    if !(1..=maximum_files).contains(&count) {
        return Err(invalid("checkout file count out of bounds"));
    }
    let directory = path(reader)?;
    let mut files = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let mut hash = [0; 20];
        reader.read_exact(&mut hash)?;
        let destination = path(reader)?;
        let prefer_cached = match protocol::word(reader)? {
            1 => false,
            3 => true,
            _ => return Err(invalid("checkout requires overwriting files")),
        };
        let normalize = match protocol::word(reader)? {
            0 => false,
            1 => true,
            _ => return Err(invalid("invalid checkout EOL policy")),
        };
        files.push(Input { hash, destination, normalize, prefer_cached });
    }
    Ok(Request { id, directory, files })
}

#[inline]
pub(crate) fn path(reader: &mut impl Read) -> io::Result<PathBuf> {
    let length = protocol::word(reader)? as usize;
    if !(1..=MAX_PATH).contains(&length) {
        return Err(invalid("checkout path length out of bounds"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    if bytes.contains(&0) {
        return Err(invalid("checkout path must be absolute and contain no NUL"));
    }
    let raw = String::from_utf8(bytes).map_err(|_| invalid("checkout path is not UTF-8"))?;
    let name = raw.trim();
    let path = if name.len() == raw.len() { PathBuf::from(raw) } else { PathBuf::from(name) };
    if !path.is_absolute() {
        return Err(invalid("checkout path must be absolute and contain no NUL"));
    }
    Ok(path)
}

fn sequential_preflight(
    request: &Request,
    state: &mut cache::State,
    use_cache: bool,
) -> io::Result<Vec<Vec<u8>>> {
    let mut inflated = 0;
    let mut compressed = 0;
    let mut files = Vec::with_capacity(request.files.len());
    for input in &request.files {
        let body = load_source_body(
            request,
            input,
            state,
            use_cache,
            MAX_BYTES.saturating_sub(inflated),
            &mut compressed,
        )?;
        let contents = if input.normalize { eol::auto(body) } else { body };
        inflated = inflated.saturating_add(contents.len());
        if inflated > MAX_BYTES {
            return Err(invalid("checkout materialized bytes out of bounds"));
        }
        files.push(contents);
    }
    Ok(files)
}

#[inline]
fn load_source_body(
    request: &Request,
    input: &Input,
    state: &mut cache::State,
    use_cache: bool,
    remaining: usize,
    compressed: &mut usize,
) -> io::Result<Vec<u8>> {
    if let Some(body) = input.cached(request, state, use_cache) {
        if body.len() > remaining {
            return Err(invalid("checkout materialized bytes out of bounds"));
        }
        return Ok(body.clone());
    }
    let body = repository::source(&request.directory, input.hash, remaining, compressed)?;
    if state.get(&request.directory, input.hash).is_none() {
        state.insert(&request.directory, input.hash, body.clone());
    }
    Ok(body)
}

#[inline]
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
    if !parent.as_os_str().is_empty() && !directories.contains(parent) {
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

#[inline]
pub(crate) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
