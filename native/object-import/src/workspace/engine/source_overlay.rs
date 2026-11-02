//! A command-owned [`SourceOverlay`] view of files via [`lookup`], [`seal`], and [`source`].

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

/// Cloneable handle to a sealed, command-owned filesystem overlay view.
#[derive(Clone)]
pub(super) struct SourceOverlay {
    data: Arc<Data>,
}
/// Shared backing storage for a [`SourceOverlay`], including spooled entries and seal proofs.
#[derive(Clone)]
struct Data {
    root: PathBuf,
    physical_root: PathBuf,
    entries: BTreeMap<PathBuf, Entry>,
    proofs: Vec<proof::Proof>,
    sealed: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
enum Entry {
    Source(source::Spool),
    Removed,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Metadata {
    length: u64,
    kind: u8,
}
impl Metadata {
    #[inline]
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
    #[inline]
    pub(super) fn is_file(self) -> bool {
        self.kind == 1
    }
    #[inline]
    pub(super) fn is_dir(self) -> bool {
        self.kind == 2
    }
    #[inline]
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
    #[inline]
    pub(super) fn insert_source(
        &mut self,
        destination: &Path,
        descriptor: &Value,
    ) -> io::Result<()> {
        self.insert(destination, Entry::Source(source::Spool::parse(descriptor)?))
    }
    #[inline]
    pub(super) fn remove(&mut self, destination: &Path) -> io::Result<()> {
        self.insert(destination, Entry::Removed)
    }
    fn destination(&self, destination: &Path) -> io::Result<()> {
        path(destination)?;
        if destination == self.data.root
            || destination.file_name().is_none()
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
        let std::collections::btree_map::Entry::Vacant(slot) =
            Arc::make_mut(&mut self.data).entries.entry(destination.to_path_buf())
        else {
            return Err(invalid("overlay duplicate destination"));
        };
        slot.insert(entry);
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
