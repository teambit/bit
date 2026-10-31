mod parallel;
mod retained;
#[cfg(test)]
mod tests;

use super::{hash, invalid, wire};
use crate::read_budget::Budget;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs::{self, File as DiskFile, OpenOptions},
    io::{self, Read, Write},
    path::PathBuf,
};

pub(super) struct File {
    pub(super) relative_path: String,
    pub(super) contents: Vec<u8>,
    raw_hash: String,
    snapshot_hash: String,
    pub(super) linux_hash: String,
    pub(super) snapshot_path: PathBuf,
}
impl File {
    pub(super) fn summary(&self) -> Value {
        json!({"relativePath":self.relative_path,"rawHash":self.raw_hash,"linuxHash":self.linux_hash,"snapshotHash":self.snapshot_hash,"snapshotPath":self.snapshot_path,"bytes":self.contents.len()})
    }
    pub(super) fn spool(&self) -> io::Result<()> {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.snapshot_path)?
            .write_all(&self.contents)
    }
}
pub(super) fn capture(
    request: &wire::Begin,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Vec<File>> {
    let directory = &request.snapshot_directory;
    if !request.owned_memory
        && (!directory.is_absolute()
            || !fs::symlink_metadata(directory)?.is_dir()
            || fs::read_dir(directory)?.next().is_some())
    {
        return Err(invalid("inspection snapshot directory must be ordinary empty"));
    }
    let mut paths = HashSet::new();
    for file in &request.files {
        relative(&file.relative_path)?;
        if !paths.insert(&file.relative_path) {
            return Err(invalid("inspection duplicate path"));
        }
    }
    if request.files.len() >= 8 && rayon::current_num_threads() > 1 {
        return parallel::capture(request, maximum, snapshots);
    }
    let mut total = 0_usize;
    request.files
        .iter()
        .map(|file| {
            let (captured, bytes) =
                capture_file(file, request, maximum.saturating_sub(total), snapshots)?;
            total = total.saturating_add(bytes);
            Ok(captured)
        })
        .collect()
}

fn capture_file(
    file: &wire::Input,
    request: &wire::Begin,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<(File, usize)> {
    capture_loaded(file, request, retained::load(file, maximum, snapshots)?, maximum)
}

fn capture_shared(
    file: &wire::Input,
    request: &wire::Begin,
    budget: &Budget,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<File> {
    let loaded = retained::load_shared(file, budget, snapshots)?;
    let reserved = loaded.1.max(loaded.0.len());
    let (captured, used) = capture_loaded(file, request, loaded, super::MAX_BYTES)?;
    budget.reserve(used.saturating_sub(reserved))?;
    Ok(captured)
}

fn capture_loaded(
    file: &wire::Input,
    request: &wire::Begin,
    loaded: (Vec<u8>, usize, String),
    maximum: usize,
) -> io::Result<(File, usize)> {
    let (raw, raw_size, raw_hash) = loaded;
    let changed = file.read_token.is_some()
        || raw.starts_with(b"\xef\xbb\xbf")
        || (request.workspace_root && file.relative_path == ".bitmap");
    let mut contents = if file.read_token.is_some() { raw } else { strip_bom(raw) };
    if request.workspace_root && file.relative_path == ".bitmap" {
        contents = super::bitmap::normalize(&contents)?;
    }
    let used = raw_size.max(contents.len());
    if used > maximum {
        return Err(invalid("inspection normalized byte budget"));
    }
    let snapshot_hash = if changed { hash(&contents) } else { raw_hash.clone() };
    verify_expected(file.raw_hash.as_deref(), &raw_hash)?;
    verify_expected(file.snapshot_hash.as_deref(), &snapshot_hash)?;
    let linux_hash = linux_hash(&contents, &snapshot_hash);
    Ok((
        File {
            relative_path: file.relative_path.clone(),
            contents,
            raw_hash,
            snapshot_hash,
            linux_hash,
            snapshot_path: request.snapshot_directory.clone(),
        },
        used,
    ))
}

fn linux_hash(contents: &[u8], snapshot_hash: &str) -> String {
    if !contents.contains(&b'\r') || crate::checkout::eol::binary(contents) {
        snapshot_hash.to_string()
    } else {
        hash(&crate::checkout::eol::normalize(contents.to_vec(), false))
    }
}

fn raw(path: &PathBuf, maximum: usize) -> io::Result<Vec<u8>> {
    if !path.is_absolute() || !fs::symlink_metadata(path)?.is_file() {
        return Err(invalid("inspection unsupported path"));
    }
    let input = DiskFile::open(path)?;
    let length = input.metadata()?.len();
    if length > maximum as u64 {
        return Err(invalid("inspection byte budget"));
    }
    let mut bytes = Vec::with_capacity(length as usize);
    input
        .take((maximum + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum {
        return Err(invalid("inspection byte budget"));
    }
    Ok(bytes)
}

fn raw_shared(path: &PathBuf, budget: &Budget) -> io::Result<Vec<u8>> {
    if !path.is_absolute() || !fs::symlink_metadata(path)?.is_file() {
        return Err(invalid("inspection unsupported path"));
    }
    budget.read(DiskFile::open(path)?)
}
fn strip_bom(mut bytes: Vec<u8>) -> Vec<u8> {
    if bytes.starts_with(b"\xef\xbb\xbf") {
        bytes.drain(..3);
    }
    bytes
}
pub(super) fn relative(path: &str) -> io::Result<()> {
    if path == "__proto__"
        || path.is_empty()
        || path.len() > 32768
        || path.contains('\0')
        || path.starts_with(['/', '\\'])
        || path
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid("inspection unsafe relative path"));
    }
    Ok(())
}

fn verify_expected(expected: Option<&str>, actual: &str) -> io::Result<()> {
    if let Some(expected) = expected
        .map(str::trim)
        .filter(|val| !val.is_empty())
    {
        crate::merge_history::hash(expected)?;
        if !expected.eq_ignore_ascii_case(actual.trim()) {
            return Err(invalid("inspection expected snapshot differs"));
        }
    }
    Ok(())
}
