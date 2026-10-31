#[cfg(test)]
mod tests;

use super::unsupported;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub(crate) struct Observed {
    files: BTreeMap<PathBuf, Option<Vec<u8>>>,
    directories: BTreeMap<PathBuf, Vec<String>>,
    bytes: usize,
    ancestors: BTreeMap<PathBuf, PathBuf>,
}
impl Observed {
    pub(crate) fn read(&mut self, path: &Path) -> io::Result<Option<Vec<u8>>> {
        let bytes = match fs::symlink_metadata(path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Ok(metadata) if metadata.is_file() && metadata.len() <= 32 * 1024 * 1024 => {
                Some(crate::read_budget::Budget::new(32 * 1024 * 1024).read(fs::File::open(path)?)?)
            }
            Ok(_) => return Err(unsupported("tracking requires bounded regular files")),
            Err(error) => return Err(error),
        };
        self.bytes += bytes.as_ref().map_or(0, Vec::len);
        if self.bytes > 128 * 1024 * 1024 || self.files.len() >= 65536 {
            return Err(unsupported("tracking retained input limit"));
        }
        let hash = bytes
            .as_ref()
            .map(|bytes| Sha256::digest(bytes).to_vec());
        if self.files
            .get(path)
            .is_some_and(|original| original != &hash)
        {
            return Err(unsupported("tracking source changed during planning"));
        }
        self.files.entry(path.to_owned()).or_insert(hash);
        Ok(bytes)
    }
    pub(crate) fn directory(&mut self, path: &Path) -> io::Result<Vec<String>> {
        let names = directory(path)?;
        if self.directories.len() >= 65536 {
            return Err(unsupported("tracking directory limit"));
        }
        if self.directories
            .get(path)
            .is_some_and(|original| original != &names)
        {
            return Err(unsupported("tracking directory changed during planning"));
        }
        self.directories.entry(path.to_owned()).or_insert_with(|| names.clone());
        Ok(names)
    }
    pub(crate) fn ancestors(&mut self, root: &Path, path: &Path) -> io::Result<()> {
        if !path.starts_with(root) {
            return Err(unsupported("tracking ancestor outside workspace"));
        }
        for parent in path
            .ancestors()
            .take_while(|parent| parent.starts_with(root))
        {
            let real = ancestor(parent)?;
            if self.ancestors
                .get(parent)
                .is_some_and(|original| original != &real)
            {
                return Err(unsupported("tracking ancestor changed during planning"));
            }
            self.ancestors.entry(parent.to_owned()).or_insert(real);
        }
        Ok(())
    }
    pub(crate) fn validate(&self) -> io::Result<()> {
        for (path, real) in &self.ancestors {
            if ancestor(path)? != *real {
                return Err(unsupported("tracking ancestor changed before publication"));
            }
        }
        let mut current = Self::default();
        for (path, hash) in &self.files {
            current.read(path)?;
            if current.files.get(path) != Some(hash) {
                return Err(unsupported("tracking source changed before publication"));
            }
        }
        for (path, names) in &self.directories {
            if directory(path)? != *names {
                return Err(unsupported("tracking directory changed before publication"));
            }
        }
        Ok(())
    }
}
fn directory(path: &Path) -> io::Result<Vec<String>> {
    if !fs::symlink_metadata(path)?.is_dir() {
        return Err(unsupported("tracking directory type"));
    }
    let mut names = fs::read_dir(path)?
        .map(|entry| {
            entry.and_then(|entry| {
                entry
                    .file_name()
                    .into_string()
                    .map_err(|_| unsupported("tracking UTF-8 paths"))
            })
        })
        .collect::<io::Result<Vec<_>>>()?;
    names.retain(|name| !matches!(name.as_str(), "node_modules" | ".git" | ".bit" | ".bitTmp"));
    names.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    Ok(names)
}

fn ancestor(path: &Path) -> io::Result<PathBuf> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(unsupported("tracking ancestor is not a regular directory"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x0400 != 0 {
            return Err(unsupported("tracking ancestor is a reparse point"));
        }
    }
    fs::canonicalize(path)
}
