//! Proves that every object used for a delete decision still has its source bytes.

#[cfg(test)]
mod tests;

use super::{invalid, object_path};
use crate::workspace::engine::command::outbound;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

const MAX_READSET_BYTES: usize = 128 * 1024 * 1024;

pub(super) struct Readset {
    objects: PathBuf,
    entries: Vec<(PathBuf, Option<Vec<u8>>)>,
    bytes: usize,
}

impl Readset {
    pub(super) fn new(scope: &Path) -> Self {
        Self { objects: scope.join("objects"), entries: Vec::new(), bytes: 0 }
    }

    pub(super) fn read(&mut self, hash: &str, kind: &str) -> io::Result<Value> {
        let hash = hash.trim();
        validate_hash(hash)?;
        let path = object_path(&self.objects, hash);
        let before = optional(&path)?;
        let result = outbound::read_object(&self.objects, hash, kind);
        if optional(&path)? != before {
            return Err(invalid("remote object changed during delete planning"));
        }
        self.record(path, before)?;
        result
    }

    pub(super) fn watch_hash(&mut self, hash: &str) -> io::Result<()> {
        let hash = hash.trim();
        validate_hash(hash)?;
        self.watch(&object_path(&self.objects, hash))
    }

    pub(super) fn watch(&mut self, path: &Path) -> io::Result<()> {
        self.record(path.into(), optional(path)?)
    }

    pub(super) fn validate(&self) -> io::Result<()> {
        for (path, bytes) in &self.entries {
            if optional(path)? != *bytes {
                return Err(invalid("remote object changed before deletion"));
            }
        }
        Ok(())
    }

    fn record(&mut self, path: PathBuf, bytes: Option<Vec<u8>>) -> io::Result<()> {
        if let Some((_, previous)) = self.entries
            .iter()
            .find(|(existing, _)| existing == &path)
        {
            if previous != &bytes {
                return Err(invalid("remote object changed during delete planning"));
            }
            return Ok(());
        }
        self.bytes = self.bytes
            .checked_add(bytes.as_ref().map_or(0, Vec::len))
            .ok_or_else(|| invalid("remote object readset budget"))?;
        if self.bytes > MAX_READSET_BYTES {
            return Err(invalid("remote object readset budget"));
        }
        self.entries.push((path, bytes));
        Ok(())
    }
}

fn validate_hash(hash: &str) -> io::Result<()> {
    if hash.len() != 40
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(invalid("remote object hash"));
    }
    Ok(())
}

fn optional(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::metadata(path) {
        Ok(meta) if meta.len() > 32 * 1024 * 1024 => {
            return Err(invalid("remote object readset budget"));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    }
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}
