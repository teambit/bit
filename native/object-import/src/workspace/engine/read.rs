use super::{MAX_RAW, count, hash, invalid, path};
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
    path: PathBuf,
    hash: String,
    linux_hash: String,
    snapshot_hash: String,
}

pub(super) fn read(files: &[PathBuf], pool: &ThreadPool) -> io::Result<Vec<FileRecord>> {
    read_with(files, pool, record)
}
pub(super) fn read_with<Record: Send>(
    files: &[PathBuf],
    pool: &ThreadPool,
    record: impl Fn(&Path, Vec<u8>) -> Record + Sync,
) -> io::Result<Vec<Record>> {
    count(files.len())?;
    if files.len() >= 32
        && pool.current_num_threads() > 1
        && let Ok(output) = parallel(files, pool, &record)
    {
        return Ok(output);
    }
    // A single file can exceed its worker share while fitting the batch budget.
    // This phase only reads, so retry using the original serial budget.
    let mut total = 0;
    files
        .iter()
        .map(|file| {
            let bytes = raw(file, MAX_RAW - total)?;
            total += bytes.len();
            Ok(record(file, bytes))
        })
        .collect()
}
fn parallel<Record: Send>(
    files: &[PathBuf],
    pool: &ThreadPool,
    record: &(impl Fn(&Path, Vec<u8>) -> Record + Sync),
) -> io::Result<Vec<Record>> {
    let mut total = 0;
    let mut output = Vec::with_capacity(files.len());
    for batch in files.chunks(pool.current_num_threads()) {
        let maximum = (MAX_RAW - total) / batch.len();
        let records = pool.install(|| {
            batch
                .par_iter()
                .map(|file| {
                    let bytes = raw(file, maximum)?;
                    let length = bytes.len();
                    Ok((length, record(file, bytes)))
                })
                .collect::<io::Result<Vec<_>>>()
        })?;
        for (length, record) in records {
            total += length;
            output.push(record);
        }
    }
    Ok(output)
}
fn record(file: &Path, raw: Vec<u8>) -> FileRecord {
    let (metadata, contents) = canonical(file, raw);
    FileRecord { metadata, contents: crate::validate::hexadecimal(&contents) }
}
pub(super) fn canonical(file: &Path, raw: Vec<u8>) -> (Metadata, Vec<u8>) {
    let hash = hash(&raw);
    let has_bom = raw.starts_with(b"\xef\xbb\xbf");
    let contents = strip_bom(raw);
    let snapshot_hash = if has_bom { super::hash(&contents) } else { hash.clone() };
    let linux_hash = if contents.contains(&b'\r') {
        super::hash(&crate::checkout::eol::normalize(contents.clone(), false))
    } else {
        snapshot_hash.clone()
    };
    (Metadata { path: file.to_owned(), hash, linux_hash, snapshot_hash }, contents)
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
