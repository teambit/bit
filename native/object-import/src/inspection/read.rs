use super::{hash, invalid, wire};
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
    pub(super) linux_hash: String,
    pub(super) snapshot_path: PathBuf,
}
impl File {
    pub(super) fn summary(&self) -> Value {
        json!({"relativePath":self.relative_path,"rawHash":self.raw_hash,"linuxHash":self.linux_hash,"snapshotHash":hash(&self.contents),"snapshotPath":self.snapshot_path,"bytes":self.contents.len()})
    }
    pub(super) fn spool(&self) -> io::Result<()> {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.snapshot_path)?
            .write_all(&self.contents)
    }
}
pub(super) fn capture(request: wire::Begin, maximum: usize) -> io::Result<Vec<File>> {
    let directory = &request.snapshot_directory;
    if !directory.is_absolute()
        || !fs::symlink_metadata(directory)?.is_dir()
        || fs::read_dir(directory)?.next().is_some()
    {
        return Err(invalid("inspection snapshot directory must be ordinary empty"));
    }
    let mut files = Vec::new();
    let mut paths = HashSet::new();
    let mut total = 0;
    for file in request.files {
        relative(&file.relative_path)?;
        if !paths.insert(file.relative_path.clone()) {
            return Err(invalid("inspection duplicate path"));
        }
        let raw = raw(&file.path, maximum - total)?;
        let raw_size = raw.len();
        let raw_hash = hash(&raw);
        let mut contents = strip_bom(raw);
        if request.workspace_root && file.relative_path == ".bitmap" {
            contents = super::bitmap::normalize(&contents)?;
        }
        total += raw_size.max(contents.len());
        if total > maximum {
            return Err(invalid("inspection normalized byte budget"));
        }
        verify_expected(file.raw_hash.as_deref(), &raw_hash)?;
        verify_expected(file.snapshot_hash.as_deref(), &hash(&contents))?;
        let linux_hash = hash(&crate::checkout::eol::normalize(contents.clone(), false));
        files.push(File {
            relative_path: file.relative_path,
            contents,
            raw_hash,
            linux_hash,
            snapshot_path: directory.clone(),
        });
    }
    Ok(files)
}
fn raw(path: &PathBuf, maximum: usize) -> io::Result<Vec<u8>> {
    if !path.is_absolute() || !fs::symlink_metadata(path)?.is_file() {
        return Err(invalid("inspection unsupported path"));
    }
    let input = DiskFile::open(path)?;
    if input.metadata()?.len() > maximum as u64 {
        return Err(invalid("inspection byte budget"));
    }
    let mut bytes = Vec::new();
    input
        .take((maximum + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum {
        return Err(invalid("inspection byte budget"));
    }
    Ok(bytes)
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
    if let Some(expected) = expected {
        crate::merge_history::hash(expected)?;
        if expected != actual {
            return Err(invalid("inspection expected snapshot differs"));
        }
    }
    Ok(())
}
