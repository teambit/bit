use std::{
    io::{self, Cursor, Read},
    sync::{Arc, OnceLock},
};

static POOLS: [OnceLock<Arc<rayon::ThreadPool>>; 8] = [const { OnceLock::new() }; 8];

/// A workspace protocol session whose state survives individual requests.
/// Callers must serialize requests and wait for outstanding work before replaying it.
pub struct WorkspaceSession {
    pool: Arc<rayon::ThreadPool>,
    checkout: crate::checkout::cache::State,
    merge: crate::merge_state::State,
}

impl WorkspaceSession {
    pub fn new(threads: usize) -> io::Result<Self> {
        if !(1..=8).contains(&threads) {
            return Err(io::Error::other("thread count must be between 1 and 8"));
        }
        let mut merge = crate::merge_state::State::default();
        merge.inspection.enable_memory_snapshots();
        Ok(Self {
            pool: shared_pool(threads)?,
            checkout: crate::checkout::cache::State::default(),
            merge,
        })
    }

    /// Dispatch one existing workspace frame. An error retires the owning session.
    pub fn request(&mut self, frame: &[u8]) -> io::Result<Vec<u8>> {
        if frame.len() > crate::protocol::MAX_BATCH_BYTES {
            return Err(io::Error::other("workspace frame exceeds byte limit"));
        }
        let mut reader = Cursor::new(frame);
        let mut magic = [0; 4];
        reader.read_exact(&mut magic)?;
        let mut output = Vec::new();
        if !crate::protocol::serve_extension(
            magic,
            &mut reader,
            &mut output,
            &self.pool,
            &mut self.checkout,
            &mut self.merge,
        )? || reader.position() != frame.len() as u64
        {
            return Err(io::Error::other("invalid workspace frame"));
        }
        Ok(output)
    }
}

pub(crate) fn shared_pool(threads: usize) -> io::Result<Arc<rayon::ThreadPool>> {
    let entry = &POOLS[threads - 1];
    if let Some(pool) = entry.get() {
        return Ok(Arc::clone(pool));
    }
    let pool = Arc::new(
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|index| format!("bit-vcs-{index}"))
            .build()
            .map_err(io::Error::other)?,
    );
    Ok(Arc::clone(entry.get_or_init(|| pool)))
}
