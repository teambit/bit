use crate::stream_io::{Input, Output, Sink, StreamEvent, emit};
use bit_object_import::ImportStream;
use napi::{Error, Result, bindgen_prelude::Buffer};
use napi_derive::napi;
use std::{
    io::Cursor,
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc::{SyncSender, sync_channel},
    },
};

static ACTIVE: AtomicUsize = AtomicUsize::new(0);
struct Permit;
impl Permit {
    fn acquire() -> Result<Self> {
        if ACTIVE.fetch_add(1, Ordering::AcqRel) >= 16 {
            ACTIVE.fetch_sub(1, Ordering::AcqRel);
            return Err(Error::from_reason("import stream limit"));
        }
        Ok(Self)
    }
}
impl Drop for Permit {
    fn drop(&mut self) {
        ACTIVE.fetch_sub(1, Ordering::AcqRel);
    }
}

#[napi]
pub struct ImportStreamEngine {
    sender: Option<SyncSender<Vec<u8>>>,
    cancelled: Arc<AtomicBool>,
}

#[napi]
impl ImportStreamEngine {
    #[napi(constructor)]
    pub fn new(
        callback: Sink,
        threads: u32,
        directory: Option<String>,
        uid: Option<u32>,
        gid: Option<u32>,
    ) -> Result<Self> {
        let permit = Permit::acquire()?;
        let owner = match (uid, gid) {
            (Some(uid), Some(gid)) => Some((uid, gid)),
            (None, None) => None,
            _ => return Err(Error::from_reason("object owner requires both uid and gid")),
        };
        let stream = ImportStream::new(threads as usize, directory.map(Into::into), owner)
            .map_err(crate::failure)?;
        let (sender, receiver) = sync_channel(1);
        let cancelled = Arc::new(AtomicBool::new(false));
        let sink = Arc::new(callback);
        let input = Input {
            receiver,
            current: Cursor::new(Vec::new()),
            cancelled: Arc::clone(&cancelled),
            sink: Arc::clone(&sink),
        };
        let output = Output { bytes: Vec::new(), sink, cancelled: Arc::clone(&cancelled) };
        std::thread::Builder::new()
            .name("bit-import-protocol".into())
            .spawn(move || run(stream, input, output, permit))
            .map_err(crate::failure)?;
        Ok(Self { sender: Some(sender), cancelled })
    }

    /// One queued input plus the currently consumed input. JavaScript waits for
    /// the input acknowledgement before submitting its next Writable chunk.
    #[napi]
    pub fn write(&self, bytes: Buffer) -> Result<()> {
        if bytes.is_empty() || bytes.len() > 128 * 1024 * 1024 + 4096 {
            return Err(Error::from_reason("import input bounds"));
        }
        let input = bytes.to_vec();
        drop(bytes);
        self.send(input)
    }

    /// Copy a corked write once, without first concatenating it in JavaScript.
    #[napi]
    pub fn writev(&self, parts: Vec<Buffer>) -> Result<()> {
        if parts.len() > 4096 {
            return Err(Error::from_reason("import input vector bounds"));
        }
        let length = parts
            .iter()
            .try_fold(0_usize, |total, part| {
                total
                    .checked_add(part.len())
                    .ok_or_else(|| Error::from_reason("import input overflow"))
            })?;
        if length == 0 || length > 128 * 1024 * 1024 + 4096 {
            return Err(Error::from_reason("import input bounds"));
        }
        let mut input = Vec::with_capacity(length);
        for part in parts {
            input.extend_from_slice(&part);
        }
        self.send(input)
    }

    #[napi]
    pub fn end(&mut self) {
        self.sender.take();
    }

    #[napi]
    pub fn close(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        self.sender.take();
    }
}
impl ImportStreamEngine {
    fn send(&self, bytes: Vec<u8>) -> Result<()> {
        self.sender
            .as_ref()
            .ok_or_else(|| Error::from_reason("import input closed"))?
            .try_send(bytes)
            .map_err(crate::failure)
    }
}

impl Drop for ImportStreamEngine {
    fn drop(&mut self) {
        self.close();
    }
}

fn run(stream: ImportStream, mut input: Input, mut output: Output, permit: Permit) {
    let sink = Arc::clone(&output.sink);
    let result = catch_unwind(AssertUnwindSafe(|| stream.serve(&mut input, &mut output)));
    let error = match result {
        Ok(result) => result.err().map(|error| error.to_string()),
        Err(_) => Some("import stream panicked".into()),
    };
    drop(stream);
    drop(input);
    drop(output);
    drop(permit);
    let _closed = emit(&sink, StreamEvent { kind: "closed".into(), data: None, error });
}
