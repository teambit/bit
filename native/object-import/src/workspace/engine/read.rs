use super::{MAX_RAW, count, hash, invalid, path};
use crate::read_budget::Budget;
use rayon::{ThreadPool, prelude::*};
use serde::Serialize;
use std::{
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileRecord {
    #[serde(flatten)]
    metadata: Metadata,
    contents: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Metadata {
    pub(super) path: PathBuf,
    pub(super) hash: String,
    pub(super) linux_hash: String,
    pub(super) snapshot_hash: String,
    #[serde(skip)]
    pub(super) raw_bytes: usize,
}

pub(super) fn read(files: &[PathBuf], pool: &ThreadPool) -> io::Result<Vec<FileRecord>> {
    read_with(files, pool, record)
}
pub(super) fn read_with<Record: Send>(
    files: &[PathBuf],
    pool: &ThreadPool,
    record: impl Fn(&Path, Vec<u8>) -> Record + Sync,
) -> io::Result<Vec<Record>> {
    read_with_budget(files, pool, MAX_RAW, record)
}
/// Private native consumers may retain larger captures without enlarging the wire response.
pub(super) fn read_with_budget<Record: Send>(
    files: &[PathBuf],
    pool: &ThreadPool,
    maximum: usize,
    record: impl Fn(&Path, Vec<u8>) -> Record + Sync,
) -> io::Result<Vec<Record>> {
    if files.is_empty() {
        return Ok(Vec::new());
    }
    count(files.len())?;
    if files.len() >= 32
        && pool.current_num_threads() > 1
        && let Ok(output) = parallel(files, pool, maximum, &record)
    {
        return Ok(output);
    }
    // A file may change size after its reservation. This phase only reads, so
    // retry using the canonical serial budget before publishing any results.
    let mut total = 0;
    files
        .iter()
        .map(|file| {
            let bytes = raw(file, maximum - total)?;
            total += bytes.len();
            Ok(record(file, bytes))
        })
        .collect()
}
fn parallel<Record: Send>(
    files: &[PathBuf],
    pool: &ThreadPool,
    maximum: usize,
    record: &(impl Fn(&Path, Vec<u8>) -> Record + Sync),
) -> io::Result<Vec<Record>> {
    let remaining = Budget::new(maximum);
    pool.install(|| {
        files
            .par_iter()
            .map(|file| reserved(file, &remaining).map(|bytes| record(file, bytes)))
            .collect()
    })
}

// Reserve the complete raw allocation before reading. Large files can use the
// shared budget without being constrained to a fraction of a 64-file batch.
fn reserved(file: &Path, remaining: &Budget) -> io::Result<Vec<u8>> {
    path(file)?;
    if !fs::symlink_metadata(file)?.is_file() {
        return Err(invalid("workspace unsupported file type"));
    }
    remaining.read(File::open(file)?)
}
fn record(file: &Path, raw: Vec<u8>) -> FileRecord {
    let (metadata, contents) = canonical(file, raw);
    FileRecord { metadata, contents: crate::validate::hexadecimal(&contents) }
}
pub(super) fn canonical(file: &Path, raw: Vec<u8>) -> (Metadata, Vec<u8>) {
    let raw_bytes = raw.len();
    let hash = hash(&raw);
    let has_bom = raw.starts_with(b"\xef\xbb\xbf");
    let contents = strip_bom(raw);
    let snapshot_hash = if has_bom { super::hash(&contents) } else { hash.clone() };
    let linux_hash = if contents.contains(&b'\r') {
        super::hash(&crate::checkout::eol::normalize(contents.clone(), false))
    } else {
        snapshot_hash.clone()
    };
    (Metadata { path: file.to_owned(), hash, linux_hash, snapshot_hash, raw_bytes }, contents)
}
pub(super) fn raw(file: &Path, maximum: usize) -> io::Result<Vec<u8>> {
    path(file)?;
    if !fs::symlink_metadata(file)?.is_file() {
        return Err(invalid("workspace unsupported file type"));
    }
    let input = File::open(file)?;
    let metadata = input.metadata()?;
    if !metadata.is_file() || metadata.len() > maximum as u64 {
        return Err(invalid("workspace raw bytes limit"));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    input
        .take((maximum + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum {
        return Err(invalid("workspace raw bytes limit"));
    }
    Ok(bytes)
}
pub(super) fn strip_bom(mut bytes: Vec<u8>) -> Vec<u8> {
    if bytes.starts_with(b"\xef\xbb\xbf") {
        bytes.drain(..3);
    }
    bytes
}
