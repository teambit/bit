use napi::{
    Status,
    bindgen_prelude::Buffer,
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode, UnknownReturnValue},
};
use napi_derive::napi;
use std::{
    io::{self, Cursor, Read, Write},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::Receiver,
    },
};

#[napi(object)]
pub struct StreamEvent {
    pub kind: String,
    pub data: Option<Buffer>,
    pub error: Option<String>,
}

pub type Sink =
    ThreadsafeFunction<StreamEvent, UnknownReturnValue, StreamEvent, Status, false, false, 1>;

pub(crate) fn emit(sink: &Sink, event: StreamEvent) -> io::Result<()> {
    if sink.call(event, ThreadsafeFunctionCallMode::Blocking) != Status::Ok {
        return Err(io::Error::other("import callback closed"));
    }
    Ok(())
}

pub(crate) struct Input {
    pub(crate) receiver: Receiver<Vec<u8>>,
    pub(crate) current: Cursor<Vec<u8>>,
    pub(crate) cancelled: Arc<AtomicBool>,
    pub(crate) sink: Arc<Sink>,
}
impl Read for Input {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err(io::Error::other("import stream cancelled"));
        }
        if bytes.is_empty() {
            return Ok(0);
        }
        if self.current.position() == self.current.get_ref().len() as u64 {
            let Ok(chunk) = self.receiver.recv() else { return Ok(0) };
            self.current = Cursor::new(chunk);
            emit(&self.sink, StreamEvent { kind: "input".into(), data: None, error: None })?;
            if self.cancelled.load(Ordering::Acquire) {
                return Err(io::Error::other("import stream cancelled"));
            }
        }
        self.current.read(bytes)
    }
}

pub(crate) struct Output {
    pub(crate) bytes: Vec<u8>,
    pub(crate) sink: Arc<Sink>,
    pub(crate) cancelled: Arc<AtomicBool>,
}
impl Write for Output {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.cancelled.load(Ordering::Acquire)
            || self.bytes.len() + bytes.len() > 32 * 1024 * 1024
        {
            return Err(io::Error::other("import response cancelled or oversized"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        if self.bytes.is_empty() {
            return Ok(());
        }
        emit(
            &self.sink,
            StreamEvent {
                kind: "output".into(),
                data: Some(std::mem::take(&mut self.bytes).into()),
                error: None,
            },
        )
    }
}
