use super::{Entry, Metadata, SourceOverlay, invalid, proof};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

enum Found<'a> {
    Entry(&'a Entry),
    Directory,
    Missing,
    Disk(PathBuf),
}

impl SourceOverlay {
    fn lookup<'a>(
        &'a self,
        path: &Path,
        proofs: &mut Vec<proof::Proof>,
        depth: usize,
    ) -> io::Result<Found<'a>> {
        if depth > 32 {
            return Err(invalid("overlay link depth"));
        }
        if !self.data.sealed {
            return Err(invalid("overlay is not sealed"));
        }
        if let Some(entry) = self.data.entries.get(path) {
            return match entry {
                Entry::Removed => Ok(Found::Missing),
                Entry::Source(_) => Ok(Found::Entry(entry)),
            };
        }
        if path
            .ancestors()
            .skip(1)
            .any(|ancestor| self.data.entries.contains_key(ancestor))
        {
            return Ok(Found::Missing);
        }
        if self.data.entries
            .iter()
            .any(|(name, entry)| name.starts_with(path) && !matches!(entry, Entry::Removed))
        {
            return Ok(Found::Directory);
        }
        if let Some(mapped) = self.alias(path, proofs)? {
            return self.lookup(&mapped, proofs, depth + 1);
        }
        Ok(Found::Disk(path.to_path_buf()))
    }
    fn alias(&self, path: &Path, proofs: &mut Vec<proof::Proof>) -> io::Result<Option<PathBuf>> {
        for ancestor in path.ancestors() {
            let Some(metadata) = disk_metadata(ancestor)? else { continue };
            let physical = fs::canonicalize(ancestor)?;
            if physical == ancestor {
                return Ok(None);
            }
            proofs.push(proof::metadata(ancestor, Some(&metadata))?);
            let suffix = path.strip_prefix(ancestor).map_err(io::Error::other)?;
            let mapped = physical.join(suffix);
            let mapped = match mapped.strip_prefix(&self.data.physical_root) {
                Ok(relative) => self.data.root.join(relative),
                Err(_) => return Ok(None),
            };
            return Ok((mapped != path).then_some(mapped));
        }
        Ok(None)
    }
    pub(in crate::workspace::engine) fn metadata(
        &self,
        path: &Path,
        proofs: &mut Vec<proof::Proof>,
    ) -> io::Result<Option<Metadata>> {
        match self.lookup(path, proofs, 0)? {
            Found::Entry(Entry::Source(source)) => {
                Ok(Some(Metadata { length: source.len(), kind: 1 }))
            }
            Found::Directory => Ok(Some(Metadata { length: 0, kind: 2 })),
            Found::Missing => Ok(None),
            Found::Disk(actual) => {
                let metadata = disk_metadata(&actual)?;
                proofs.push(proof::metadata(&actual, metadata.as_ref())?);
                Ok(metadata.as_ref().map(Metadata::disk))
            }
            Found::Entry(_) => Err(invalid("overlay unresolved entry")),
        }
    }
    pub(in crate::workspace::engine) fn read(
        &self,
        path: &Path,
        proofs: &mut Vec<proof::Proof>,
    ) -> io::Result<Option<Vec<u8>>> {
        match self.lookup(path, proofs, 0)? {
            Found::Entry(Entry::Source(source)) => source.read().map(Some),
            Found::Missing => Ok(None),
            Found::Disk(actual) => proof::read(&actual, proofs),
            _ => Err(invalid("overlay read is not a file")),
        }
    }
}
fn disk_metadata(path: &Path) -> io::Result<Option<fs::Metadata>> {
    match fs::metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error)
            if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) =>
        {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}
pub(super) fn capture(
    path: &Path,
    root: &Path,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<usize> {
    let metadata = disk_metadata(path)?;
    proofs.push(proof::metadata(path, metadata.as_ref())?);
    let bytes = if metadata.as_ref().is_some_and(fs::Metadata::is_file) || metadata.is_none() {
        proof::read(path, proofs)?.map_or(0, |bytes| bytes.len())
    } else {
        0
    };
    for ancestor in path
        .ancestors()
        .skip(1)
        .take_while(|ancestor| ancestor.starts_with(root))
    {
        let metadata = disk_metadata(ancestor)?;
        if metadata
            .as_ref()
            .is_some_and(|value| !value.is_dir())
        {
            return Err(invalid("overlay parent is not a directory"));
        }
        proofs.push(proof::metadata(ancestor, metadata.as_ref())?);
    }
    Ok(bytes)
}
