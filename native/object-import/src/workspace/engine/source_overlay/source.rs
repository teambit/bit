use super::invalid;
use serde_json::Value;
use std::{
    fs,
    io::{self, Read, Seek, SeekFrom},
    path::PathBuf,
};

#[derive(Clone)]
pub(super) struct Spool {
    pub(super) path: PathBuf,
    pub(super) offset: u64,
    size: u64,
    hash: String,
}
impl Spool {
    pub(super) fn parse(value: &Value) -> io::Result<Self> {
        let path = value["spoolPath"].as_str().ok_or_else(|| invalid("overlay spool path"))?;
        let size = value["bytes"].as_u64().ok_or_else(|| invalid("overlay spool size"))?;
        let hash = value["spoolHash"].as_str().ok_or_else(|| invalid("overlay spool hash"))?;
        crate::workspace::engine::path(std::path::Path::new(path))?;
        if size > 1024 * 1024 {
            return Err(invalid("overlay source size"));
        }
        let offset = value["spoolOffset"].as_u64().unwrap_or(0);
        offset.checked_add(size).ok_or_else(|| invalid("overlay spool overflow"))?;
        Ok(Self { path: PathBuf::from(path), offset, size, hash: hash.to_owned() })
    }
    pub(super) fn read(&self) -> io::Result<Vec<u8>> {
        let mut file = fs::File::open(&self.path)?;
        file.seek(SeekFrom::Start(self.offset))?;
        let mut bytes = Vec::new();
        file.take(self.size).read_to_end(&mut bytes)?;
        if bytes.len() as u64 != self.size || crate::workspace::engine::hash(&bytes) != self.hash {
            return Err(invalid("overlay spool changed"));
        }
        Ok(bytes)
    }
    pub(super) fn len(&self) -> u64 {
        self.size
    }
}
