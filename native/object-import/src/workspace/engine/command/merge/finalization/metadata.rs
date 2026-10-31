//! Generated package `JsonVinyl` uses write-file-atomic, breaking hardlink aliases.
#[cfg(test)]
mod tests;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub(super) fn replace(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.is_symlink() {
        return Err(io::Error::other("generated package destination must be an ordinary file"));
    }
    let (temporary, mut file) = allocate(path)?;
    (|| {
        file.write_all(bytes)?;
        preserve_owner(&temporary.0, &metadata)?;
        file.set_permissions(metadata.permissions())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary.0, path)
    })()
}

fn allocate(path: &Path) -> io::Result<(Temporary, File)> {
    let parent = path.parent().ok_or_else(|| io::Error::other("package parent absent"))?;
    for _ in 0..64 {
        let path = parent.join(format!(
            ".bit-package-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed),
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((Temporary(path), file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::other("package temporary allocation limit"))
}

fn preserve_owner(path: &Path, metadata: &fs::Metadata) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, chown};
        chown(path, Some(metadata.uid()), Some(metadata.gid()))?;
    }
    #[cfg(not(unix))]
    let _ = (path, metadata);
    Ok(())
}

struct Temporary(PathBuf);
impl Drop for Temporary {
    fn drop(&mut self) {
        let _cleanup = fs::remove_file(&self.0);
    }
}
