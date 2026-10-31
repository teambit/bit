//! The `BWS1` request frames of `bit-object-import`'s workspace session: one
//! JSON request per frame, answered with a versioned JSON response.

mod proofs;

use bit_object_import::WorkspaceSession;
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::Value;
use std::{io, thread};

const MAX_REQUEST: usize = 4 * 1024 * 1024;
const MAX_RESPONSE: usize = 32 * 1024 * 1024;

pub(crate) struct Engine {
    session: WorkspaceSession,
    next_id: u32,
}

#[derive(Deserialize)]
struct Response {
    version: u32,
    id: u32,
    #[serde(default)]
    failed: Option<Value>,
    #[serde(default)]
    skipped: Option<Vec<Value>>,
    #[serde(default)]
    data: Value,
    #[serde(default)]
    error: Option<String>,
    #[serde(rename = "canonicalError")]
    canonical_error: Option<bool>,
}

impl Engine {
    pub fn new() -> io::Result<Self> {
        let threads = thread::available_parallelism().map_or(1, usize::from).min(4);
        Ok(Self { session: WorkspaceSession::new(threads)?, next_id: 0 })
    }

    /// One request; a failed or skipped request is an error.
    pub fn request<Output: DeserializeOwned>(&mut self, input: &Value) -> io::Result<Output> {
        let started = std::time::Instant::now();
        let result = self.request_owned(input);
        let kind = input["kind"]
            .as_str()
            .map(str::trim)
            .filter(|kind| !kind.is_empty())
            .unwrap_or("request");
        crate::trace::log(format!("engine {kind} took {} ms", started.elapsed().as_millis()));
        result
    }

    /// Deliver operation metadata while a native request retains its state and transfer ownership.
    pub fn request_with_progress<Output: DeserializeOwned + Send>(
        &mut self,
        input: &Value,
        mut observe: impl FnMut(bit_object_import::export_progress::Event),
    ) -> io::Result<Output> {
        let (sender, receiver) = std::sync::mpsc::sync_channel(32);
        let actions = bit_object_import::export_actions::current();
        thread::scope(|threads| {
            let request = threads.spawn(move || {
                let _actions = bit_object_import::export_actions::bind(actions);
                bit_object_import::export_progress::scope(&sender, || self.request(input))
            });
            for event in receiver {
                observe(event);
            }
            request.join().unwrap_or_else(|panic| std::panic::resume_unwind(panic))
        })
    }

    fn request_owned<Output: DeserializeOwned>(&mut self, input: &Value) -> io::Result<Output> {
        let body = serde_json::to_vec(input)?;
        if body.len() > MAX_REQUEST {
            return Err(io::Error::other("status input limit"));
        }
        self.next_id = self.next_id
            .checked_add(1)
            .ok_or_else(|| io::Error::other("engine request id limit"))?;
        let mut frame = Vec::with_capacity(12 + body.len());
        frame.extend_from_slice(b"BWS1");
        frame.extend_from_slice(&self.next_id.to_be_bytes());
        frame.extend_from_slice(
            &u32::try_from(body.len()).map_err(io::Error::other)?.to_be_bytes(),
        );
        frame.extend_from_slice(&body);
        let bytes = self.session.request(&frame)?;
        if bytes.len() > MAX_RESPONSE {
            return Err(io::Error::other("status output limit"));
        }
        let response: Response = serde_json::from_slice(&bytes)?;
        let failed = response.failed
            .as_ref()
            .is_some_and(|failed| !failed.is_null() && *failed != false);
        let skipped = response.skipped
            .as_ref()
            .is_some_and(|skipped| !skipped.is_empty());
        if response.version != 1 || response.id != self.next_id || failed || skipped {
            return Err(response_error(input, response));
        }
        serde_json::from_value(response.data).map_err(io::Error::other)
    }
}

fn response_error(input: &Value, response: Response) -> io::Error {
    if response.canonical_error == Some(true)
        && let Some(message) = response.error
    {
        return io::Error::other(CanonicalError {
            message,
            progress: response.data.get("progress").cloned(),
        });
    }
    let kind = input
        .get("kind")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|kind| !kind.is_empty())
        .unwrap_or("request");
    let reason = response.error
        .as_deref()
        .map(str::trim)
        .filter(|error| !error.is_empty())
        .map_or_else(String::new, |error| format!(": {error}"));
    io::Error::other(format!("the engine declined {kind}{reason}"))
}

#[derive(Debug)]
struct CanonicalError {
    message: String,
    progress: Option<Value>,
}
impl std::fmt::Display for CanonicalError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.message.fmt(formatter)
    }
}
impl std::error::Error for CanonicalError {}

pub(super) fn is_canonical(error: &io::Error) -> bool {
    let mut cause = error
        .get_ref()
        .map(|error| error as &dyn std::error::Error);
    while let Some(error) = cause {
        if error.is::<CanonicalError>() {
            return true;
        }
        cause = error.source();
    }
    false
}

/// Preserve a published command error without delegating the invocation again.
pub(super) fn canonical_error(message: String) -> io::Error {
    io::Error::other(CanonicalError { message, progress: None })
}

/// Actual completed native phases preceding an owned command error.
pub(super) fn canonical_progress(error: &io::Error) -> Option<&Value> {
    let mut cause = error
        .get_ref()
        .map(|error| error as &dyn std::error::Error);
    while let Some(error) = cause {
        if let Some(error) = error.downcast_ref::<CanonicalError>() {
            return error.progress.as_ref();
        }
        cause = error.source();
    }
    None
}
