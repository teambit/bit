//! Owned compressed transfer collection, tar framing and remote acknowledgement policy.
pub(crate) mod collection;
pub(crate) mod object;
pub(crate) use session::State;

use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

use sha1::{Digest, Sha1};

mod owned;
mod pending;
mod session;
mod transaction;

mod header;
#[cfg(test)]
mod tests;

const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_OBJECTS: usize = 4096;

pub(crate) enum Body {
    Repository,
    Snapshot(Vec<u8>),
    Metadata(Vec<u8>),
}

pub(crate) struct Descriptor {
    pub(crate) hash: [u8; 20],
    pub(crate) scope: Option<String>,
    pub(crate) seconds: u32,
    pub(crate) body: Body,
}

pub(crate) struct Prepared {
    pub(crate) path: PathBuf,
    pub(crate) count: usize,
    pub(crate) compressed_bytes: usize,
    pub(crate) archive_bytes: usize,
    pub(crate) objects_hash: String,
    pub(crate) archive_hash: String,
}

pub(crate) fn prepare(
    directory: &Path,
    archive: &Path,
    items: Vec<Descriptor>,
) -> io::Result<Prepared> {
    paths(directory, archive)?;
    let entries = collect(directory, items)?;
    let mut writer = Archive::new(archive)?;
    let mut objects = Sha1::new();
    let mut compressed_bytes = 0;
    for (header, body) in &entries {
        objects.update(body);
        compressed_bytes += body.len();
        writer.entry(header, body)?;
    }
    writer.write(&[0; 1024])?;
    writer.file.flush()?;
    writer.complete = true;
    Ok(Prepared {
        path: archive.to_path_buf(),
        count: entries.len(),
        compressed_bytes,
        archive_bytes: writer.bytes,
        objects_hash: crate::validate::hexadecimal(&objects.finalize()),
        archive_hash: crate::validate::hexadecimal(&writer.digest.clone().finalize()),
    })
}

fn collect(directory: &Path, items: Vec<Descriptor>) -> io::Result<Vec<([u8; 512], Vec<u8>)>> {
    if items.len() > MAX_OBJECTS {
        return Err(invalid("transfer object count exceeds bounds"));
    }
    let mut seen = HashSet::new();
    let mut bytes = 0;
    let mut inflated = 0;
    let mut entries = Vec::new();
    for item in items {
        let name = object::name(&item)?;
        if !seen.insert(name.clone()) {
            continue;
        }
        let (body, raw, _) = object::read(directory, &item, MAX_BYTES - bytes)?;
        bytes += body.len();
        inflated += raw;
        if inflated > MAX_BYTES {
            return Err(invalid("transfer inflated bytes exceed bounds"));
        }
        let header = header::encode(&name, body.len(), item.seconds)?;
        entries.push((header, body));
    }
    Ok(entries)
}

fn paths(directory: &Path, archive: &Path) -> io::Result<()> {
    if !directory.is_absolute() || !archive.is_absolute() || archive == directory {
        return Err(invalid("transfer paths must be absolute"));
    }
    for path in [directory, archive] {
        if path
            .to_str()
            .is_none_or(|text| text.len() > 32768 || text.contains('\0'))
        {
            return Err(invalid("unsupported transfer path"));
        }
    }
    Ok(())
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

struct Archive {
    file: fs::File,
    path: PathBuf,
    digest: Sha1,
    bytes: usize,
    complete: bool,
}

impl Archive {
    fn new(path: &Path) -> io::Result<Self> {
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        Ok(Self { file, path: path.to_path_buf(), digest: Sha1::new(), bytes: 0, complete: false })
    }

    fn write(&mut self, bytes: &[u8]) -> io::Result<()> {
        self.file.write_all(bytes)?;
        self.digest.update(bytes);
        self.bytes += bytes.len();
        Ok(())
    }

    fn entry(&mut self, header: &[u8; 512], body: &[u8]) -> io::Result<()> {
        self.write(header)?;
        self.write(body)?;
        self.write(&[0; 512][..(512 - body.len() % 512) % 512])
    }
}

impl Drop for Archive {
    fn drop(&mut self) {
        if !self.complete {
            let _ = fs::remove_file(&self.path);
        }
    }
}

pub(crate) fn apply(
    kind: &str,
    input: &serde_json::Value,
    state: &mut State,
) -> io::Result<serde_json::Value> {
    match kind {
        "transferCollect" => owned::collect(state, input),
        "transferInitialize" => owned::initialize(state, input),
        "transferArchive" => owned::archive(state, input),
        "transferTransactionInitialize" => state.transaction(input),
        "transferTransactionReceipt" => state.receipt(input),
        "transferRelease" => release(state, input),
        "transferPending" => pending::write(state, input),
        _ => Err(invalid("unknown transfer operation")),
    }
}

fn release(state: &mut State, input: &serde_json::Value) -> io::Result<serde_json::Value> {
    let token = input
        .get("token")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| invalid("missing transfer release token"))?;
    let removed = state.collections.remove(token).is_some();
    if state.plans.remove(token).is_some() {
        return Ok(serde_json::json!({"released":true}));
    }
    if removed {
        Ok(serde_json::json!({"released":true}))
    } else {
        Err(invalid("unknown transfer release token"))
    }
}
