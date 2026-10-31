use std::{
    fs, io,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
pub(super) struct Directory(pub(super) PathBuf);
impl Directory {
    pub(super) fn create() -> io::Result<Self> {
        let parent = fs::canonicalize(std::env::temp_dir())?;
        for _ in 0..64 {
            let path = parent.join(format!(
                "bit-native-command-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed),
            ));
            match private_builder().create(&path) {
                Ok(()) => return Ok(Self(path)),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
        Err(io::Error::other("command scratch directory allocation limit"))
    }
}
impl Directory {
    /// An empty subdirectory for one of several users of this directory.
    pub(super) fn child(&self, index: usize) -> io::Result<PathBuf> {
        if index > 65536 {
            return Err(io::Error::other("command scratch child index limit"));
        }
        let path = self.0.join(index.to_string());
        private_builder().create(&path)?;
        Ok(path)
    }
}

impl Drop for Directory {
    fn drop(&mut self) {
        let _cleanup = fs::remove_dir_all(&self.0);
    }
}

fn private_builder() -> fs::DirBuilder {
    let builder = fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        let mut builder = builder;
        builder.mode(0o700);
        builder
    }
    #[cfg(not(unix))]
    {
        builder
    }
}
