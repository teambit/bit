use std::{
    fs::File,
    io::{self, Read},
    sync::atomic::{AtomicUsize, Ordering},
};

/// A request owns one byte allowance, shared by all of its worker reads.
/// Failed reads abandon the entire allowance before canonical retry.
pub(crate) struct Budget(AtomicUsize);

impl Budget {
    pub(crate) fn new(bytes: usize) -> Self {
        Self(AtomicUsize::new(bytes))
    }

    pub(crate) fn reserve(&self, bytes: usize) -> io::Result<()> {
        if bytes == 0 {
            return Ok(());
        }
        self.0
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |remaining| {
                remaining.checked_sub(bytes)
            })
            .map_err(|_| io::Error::other("parallel read byte budget"))?;
        Ok(())
    }

    /// Reserve before allocating; growth or shrinkage takes the read-only retry path.
    pub(crate) fn read(&self, mut input: File) -> io::Result<Vec<u8>> {
        let metadata = input.metadata()?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(io::Error::other("parallel read requires a regular file"));
        }
        let length = usize::try_from(metadata.len()).map_err(io::Error::other)?;
        if length > 32 * 1024 * 1024 {
            return Err(io::Error::other("parallel read single file budget"));
        }
        self.reserve(length)?;
        let mut bytes = vec![0; length];
        input.read_exact(&mut bytes)?;
        if input.read(&mut [0])? != 0 {
            return Err(io::Error::other("parallel read file grew"));
        }
        Ok(bytes)
    }
}
