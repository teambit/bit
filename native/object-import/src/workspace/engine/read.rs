use super::{MAX_RAW, count, hash, invalid, path};
use serde::Serialize;
use std::{
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileRecord {
    path: PathBuf,
    contents: String,
    hash: String,
    linux_hash: String,
    snapshot_hash: String,
}

pub(super) fn read(files: &[PathBuf]) -> io::Result<Vec<FileRecord>> {
    count(files.len())?;
    let mut total = 0;
    let mut output = Vec::with_capacity(files.len());
    for file in files {
        let raw = raw(file, MAX_RAW - total)?;
        total += raw.len();
        let hash = hash(&raw);
        let contents = strip_bom(raw);
        let snapshot_hash = super::hash(&contents);
        let linux_hash = super::hash(&crate::checkout::eol::normalize(contents.clone(), false));
        output.push(FileRecord {
            path: file.clone(),
            contents: crate::validate::hexadecimal(&contents),
            hash,
            linux_hash,
            snapshot_hash,
        });
    }
    Ok(output)
}
pub(super) fn raw(file: &Path, maximum: usize) -> io::Result<Vec<u8>> {
    path(file)?;
    if !fs::symlink_metadata(file)?.is_file() {
        return Err(invalid("workspace unsupported file type"));
    }
    let input = File::open(file)?;
    if !input.metadata()?.is_file() || input.metadata()?.len() > maximum as u64 {
        return Err(invalid("workspace raw bytes limit"));
    }
    let mut bytes = Vec::new();
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
