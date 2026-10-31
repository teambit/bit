//! A command-owned view of files before its retained writes become visible.
mod lookup;
mod seal;
mod source;
#[cfg(test)]
mod tests;

use super::{dependency_graph::proof, invalid, path, resolve_dependencies::normalize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Clone)]
pub(super) struct SourceOverlay {
    data: Arc<Data>,
}
#[derive(Clone)]
struct Data {
    root: PathBuf,
    physical_root: PathBuf,
    entries: BTreeMap<PathBuf, Entry>,
    proofs: Vec<proof::Proof>,
    sealed: bool,
}
#[derive(Clone)]
enum Entry {
    Source(source::Spool),
    Removed,
}
#[derive(Clone, Copy)]
pub(super) struct Metadata {
    length: u64,
    kind: u8,
}
impl Metadata {
    pub(super) fn disk(value: &fs::Metadata) -> Self {
        Self {
            length: value.len(),
            kind: if value.is_file() {
                1
            } else if value.is_dir() {
                2
            } else {
                0
            },
        }
    }
    pub(super) fn is_file(self) -> bool {
        self.kind == 1
    }
    pub(super) fn is_dir(self) -> bool {
        self.kind == 2
    }
    pub(super) fn len(self) -> u64 {
        self.length
    }
}
impl SourceOverlay {
    pub(super) fn new(root: &Path) -> io::Result<Self> {
        path(root)?;
        if normalize(root) != root {
            return Err(invalid("overlay root"));
        }
        let physical_root = fs::canonicalize(root)?;
        if !physical_root.is_dir() {
            return Err(invalid("overlay root"));
        }
        Ok(Self {
            data: Arc::new(Data {
                root: root.to_path_buf(),
                physical_root,
                entries: BTreeMap::new(),
                proofs: Vec::new(),
                sealed: false,
            }),
        })
    }
    pub(super) fn insert_source(
        &mut self,
        destination: &Path,
        descriptor: &Value,
    ) -> io::Result<()> {
        self.insert(destination, Entry::Source(source::Spool::parse(descriptor)?))
    }
    pub(super) fn remove(&mut self, destination: &Path) -> io::Result<()> {
        self.insert(destination, Entry::Removed)
    }
    fn destination(&self, destination: &Path) -> io::Result<()> {
        path(destination)?;
        if destination == self.data.root
            || !destination.starts_with(&self.data.root)
            || normalize(destination) != destination
        {
            return Err(invalid("overlay destination"));
        }
        Ok(())
    }
    fn insert(&mut self, destination: &Path, entry: Entry) -> io::Result<()> {
        self.destination(destination)?;
        if self.data.sealed || self.data.entries.len() >= 8192 {
            return Err(invalid("overlay entry budget"));
        }
        let data = Arc::make_mut(&mut self.data);
        if data.entries.contains_key(destination) {
            return Err(invalid("overlay duplicate destination"));
        }
        data.entries.insert(destination.to_path_buf(), entry);
        Ok(())
    }
    pub(super) fn seal(mut self) -> io::Result<Self> {
        if self.data.sealed {
            return Ok(self);
        }
        let data = Arc::make_mut(&mut self.data);
        data.proofs = seal::capture(data)?;
        proof::verify(&data.proofs)?;
        data.sealed = true;
        Ok(self)
    }
    pub(super) fn proofs(&self) -> io::Result<Vec<proof::Proof>> {
        if !self.data.sealed {
            return Err(invalid("overlay is not sealed"));
        }
        Ok(self.data.proofs.clone())
    }
}
