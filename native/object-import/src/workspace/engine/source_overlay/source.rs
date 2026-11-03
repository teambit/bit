//! [`Spool`] slice descriptor parsing and hash-verified reading for source overlays.

use super::invalid;
use serde_json::Value;
use std::{
    fs,
    io::{self, Read, Seek, SeekFrom},
    path::PathBuf,
};

/// Validated byte-range and SHA-1 descriptor for a spooled overlay file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Spool {
    pub(super) path: PathBuf,
    pub(super) offset: u64,
    size: u64,
    hash: String,
}
impl Spool {
    /// Parses and validates a [`Spool`] descriptor from `value` ([`Value`]), enforcing the 1 MiB slice limit.
    pub(super) fn parse(value: &Value) -> io::Result<Self> {
        let path = value["spoolPath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("overlay spool path"))?;
        let size = value["bytes"].as_u64().ok_or_else(|| invalid("overlay spool size"))?;
        let raw_hash = value["spoolHash"].as_str().ok_or_else(|| invalid("overlay spool hash"))?;
        let hash = crate::validate::hexadecimal(&crate::merge_history::hash(raw_hash.trim())?);
        crate::workspace::engine::path(std::path::Path::new(path))?;
        if size > 1024 * 1024 {
            return Err(invalid("overlay source size"));
        }
        let offset = match value
            .get("spoolOffset")
            .filter(|val| !val.is_null())
        {
            None => 0,
            Some(val) => val.as_u64().ok_or_else(|| invalid("overlay spool offset"))?,
        };
        offset.checked_add(size).ok_or_else(|| invalid("overlay spool overflow"))?;
        Ok(Self { path: PathBuf::from(path), offset, size, hash })
    }
    /// Reads and SHA-1 verifies the spooled byte slice from disk at `self.path` ([`PathBuf`]).
    pub(super) fn read(&self) -> io::Result<Vec<u8>> {
        let metadata = fs::symlink_metadata(&self.path)?;
        if !metadata.is_file()
            || self.offset
                .checked_add(self.size)
                .is_none_or(|end| end > metadata.len())
        {
            return Err(invalid("overlay spool changed"));
        }
        let mut file = fs::File::open(&self.path)?;
        if self.offset > 0 {
            file.seek(SeekFrom::Start(self.offset))?;
        }
        let mut bytes = Vec::with_capacity(self.size as usize);
        file.take(self.size).read_to_end(&mut bytes)?;
        if bytes.len() as u64 != self.size || crate::workspace::engine::hash(&bytes) != self.hash {
            return Err(invalid("overlay spool changed"));
        }
        Ok(bytes)
    }
    /// Returns the declared byte length of the spooled slice.
    #[inline]
    pub(super) fn len(&self) -> u64 {
        self.size
    }
}
