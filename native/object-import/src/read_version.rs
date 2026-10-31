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
    query: bool,
    history_artifacts: bool,
    metadata: Option<(String, usize, usize)>,
}
impl<'a> Reader<'a> {
    pub(crate) fn new(directory: &'a Path) -> io::Result<Self> {
        merge_history::path(directory)?;
        Ok(Self {
            directory,
            compressed: 0,
            raw: 0,
            records: 0,
            query: false,
            history_artifacts: false,
            metadata: None,
        })
    }
    pub(crate) fn query(directory: &'a Path) -> io::Result<Self> {
        let mut reader = Self::new(directory)?;
        reader.query = true;
        Ok(reader)
    }
    pub(crate) fn history_with_artifacts(directory: &'a Path) -> io::Result<Self> {
        let mut reader = Self::new(directory)?;
        reader.history_artifacts = true;
        Ok(reader)
    }
    pub(crate) fn metadata(&self) -> Option<&(String, usize, usize)> {
        self.metadata.as_ref()
    }
    pub(crate) fn stats(&self) -> (usize, usize) {
        (self.records, self.raw)
    }
    pub(crate) fn read(&mut self, reference: &str) -> io::Result<Value> {
        if self.records >= MAX_RECORDS {
            return Err(invalid("Version read count limit"));
        }
        let hash = merge_history::hash(reference)?;
        let before = self.compressed;
        let budget =
            MAX_BYTES.checked_sub(self.raw).ok_or_else(|| invalid("Version read byte limit"))?;
        let object = repository::read(self.directory, hash, budget, &mut self.compressed)?;
        self.raw += object.len();
        self.records += 1;
        let (size, body) = repository::split(&object, hash, "Version")?;
        if size.parse::<usize>().is_err() {
            return Err(invalid("invalid Version header size"));
        }
        let value: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
        if self.query || self.history_artifacts {
            crate::history_query::validate_version(&value)?;
        } else {
            crate::transfer::collection::shape::history(&value)?;
        }
        parents(&value)?;
        if self.query {
            self.metadata = Some((
                String::from_utf8(body.to_vec()).map_err(io::Error::other)?,
                object.len(),
                self.compressed - before,
            ));
        }
        Ok(value)
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

pub(crate) fn parents(value: &Value) -> io::Result<()> {
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
