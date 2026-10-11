use crate::{checkout::repository, merge_history};
use serde_json::Value;
use std::{io, path::Path};

const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_RECORDS: usize = 4096;
/// Versions have mutable bodies under stable identifiers, so every reader starts
/// a fresh bounded batch instead of using the immutable Source snapshot cache.
pub(crate) struct Reader<'a> {
    directory: &'a Path,
    compressed: usize,
    raw: usize,
    records: usize,
}
impl<'a> Reader<'a> {
    pub(crate) fn new(directory: &'a Path) -> io::Result<Self> {
        merge_history::path(directory)?;
        Ok(Self { directory, compressed: 0, raw: 0, records: 0 })
    }
    pub(crate) fn read(&mut self, reference: &str) -> io::Result<Value> {
        if self.records >= MAX_RECORDS {
            return Err(invalid("Version read count limit"));
        }
        let hash = merge_history::hash(reference)?;
        let object =
            repository::read(self.directory, hash, MAX_BYTES - self.raw, &mut self.compressed)?;
        self.raw += object.len();
        self.records += 1;
        let (size, body) = repository::split(&object, hash, "Version")?;
        if size.parse::<usize>().is_err() {
            return Err(invalid("invalid Version header size"));
        }
        let value: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
        merge_history::metadata::validate(&value)?;
        parents(&value)?;
        Ok(value)
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn parents(value: &Value) -> io::Result<()> {
    let Some(parents) = value
        .get("parents")
        .filter(|parents| !parents.is_null())
    else {
        return Ok(());
    };
    let parents = parents.as_array().ok_or_else(|| invalid("invalid Version parents"))?;
    if parents.len() > MAX_RECORDS {
        return Err(invalid("Version parent count limit"));
    }
    for parent in parents {
        merge_history::hash(parent.as_str().ok_or_else(|| invalid("invalid Version parent"))?)?;
    }
    Ok(())
}
