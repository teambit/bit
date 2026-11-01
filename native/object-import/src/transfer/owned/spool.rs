//! Private staging-file spooling with rollback cleanup on failed collection attempts.
use super::{Entry, invalid};
use std::{
    fs,
    io::{self, Write},
    path::PathBuf,
};

#[derive(Debug, Default)]
struct Pending(Vec<PathBuf>);
impl Drop for Pending {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = fs::remove_file(path);
        }
    }
}
pub(super) fn write(entries: &[Entry]) -> io::Result<Vec<PathBuf>> {
    let mut pending = Pending(Vec::with_capacity(entries.len()));
    for entry in entries {
        let path = entry.path
            .as_ref()
            .filter(|candidate| {
                candidate.is_absolute()
                    && candidate.file_name().is_some()
                    && !candidate
                        .components()
                        .any(|comp| matches!(comp, std::path::Component::ParentDir))
                    && !candidate.is_symlink()
                    && candidate
                        .parent()
                        .is_some_and(|parent| !parent.is_symlink())
            })
            .ok_or_else(|| invalid("missing private spool path"))?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        pending.0.push(path.clone());
        file.write_all(&entry.compressed)?;
    }
    Ok(std::mem::take(&mut pending.0))
}
