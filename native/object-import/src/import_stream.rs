use std::{
    io::{self, Read, Write},
    path::PathBuf,
    sync::Arc,
};

/// An interactive import protocol owner. The caller supplies a dedicated protocol
/// thread so waiting for JavaScript selection never occupies a shared Rayon worker.
pub struct ImportStream {
    pool: Arc<rayon::ThreadPool>,
    store: Option<crate::store::Store>,
}

impl ImportStream {
    pub fn new(
        threads: usize,
        directory: Option<PathBuf>,
        owner: Option<(u32, u32)>,
    ) -> io::Result<Self> {
        if !(1..=8).contains(&threads) || (owner.is_some() && directory.is_none()) {
            return Err(io::Error::other("invalid import stream options"));
        }
        Ok(Self {
            pool: crate::session::shared_pool(threads)?,
            store: directory
                .map(|directory| crate::store::Store::new(directory, owner))
                .transpose()?,
        })
    }

    pub fn serve(&self, reader: &mut impl Read, writer: &mut impl Write) -> io::Result<()> {
        crate::protocol::serve_with_store(reader, writer, &self.pool, self.store.as_ref())
    }
}
