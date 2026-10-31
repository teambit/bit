//! Bounded stash metadata reads and unchanged-directory validation.
use super::invalid;
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};
const LIMIT: usize = 32 * 1024 * 1024;
const ENTRY_LIMIT: usize = 4096;
#[derive(PartialEq, Eq)]
pub(super) struct Observation {
    directory: PathBuf,
    files: BTreeMap<String, Vec<u8>>,
}
impl Observation {
    pub(super) fn read(scope: &Path) -> io::Result<Self> {
        let directory = scope.join("stash");
        let files = read_files(&directory)?;
        Ok(Self { directory, files })
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        if read_files(&self.directory)? != self.files {
            return Err(invalid("stash metadata changed before publication"));
        }
        Ok(())
    }
    pub(super) fn directory(&self) -> &Path {
        &self.directory
    }
    pub(super) fn files(&self) -> &BTreeMap<String, Vec<u8>> {
        &self.files
    }
    pub(super) fn file(&self, name: &str) -> Option<&[u8]> {
        self.files.get(name.trim()).map(Vec::as_slice)
    }
    pub(super) fn latest(&self) -> Option<&str> {
        self.files.last_key_value().map(|(name, _)| name.as_str())
    }
}
fn read_files(directory: &Path) -> io::Result<BTreeMap<String, Vec<u8>>> {
    match fs::symlink_metadata(directory) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => return Err(invalid("stash directory is not a regular directory")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
        Err(error) => return Err(error),
    }
    let mut files = BTreeMap::new();
    let mut remaining = LIMIT;
    for entry in fs::read_dir(directory)? {
        if let Some((name, bytes)) = read_entry(&entry?, &mut remaining, files.len())? {
            files.insert(name, bytes);
        }
    }
    Ok(files)
}

fn read_entry(
    entry: &fs::DirEntry,
    remaining: &mut usize,
    count: usize,
) -> io::Result<Option<(String, Vec<u8>)>> {
    let name = entry
        .file_name()
        .into_string()
        .map_err(|_| invalid("stash filename is not UTF-8"))?;
    if !name.starts_with("stash-") {
        return Ok(None);
    }
    let metadata = fs::symlink_metadata(entry.path())?;
    if metadata.file_type().is_symlink() {
        return Err(invalid("stash metadata is a symbolic link"));
    }
    if !metadata.is_file() {
        return Ok(None);
    }
    if count == ENTRY_LIMIT {
        return Err(invalid("stash metadata entry count exceeds read budget"));
    }
    let length = usize::try_from(metadata.len()).map_err(io::Error::other)?;
    *remaining = remaining
        .checked_sub(length)
        .ok_or_else(|| invalid("stash metadata exceeds read budget"))?;
    let mut bytes = Vec::new();
    fs::File::open(entry.path())?
        .take(u64::try_from(length).map_err(io::Error::other)? + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() != length {
        return Err(invalid("stash metadata changed while reading"));
    }
    Ok(Some((name, bytes)))
}
