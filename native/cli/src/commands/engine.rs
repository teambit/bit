//! The `BWS1` request frames of `bit-object-import`'s workspace session: one
//! JSON request per frame, answered with a versioned JSON response.

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
        let body = serde_json::to_vec(input)?;
        if body.len() > MAX_REQUEST {
            return Err(io::Error::other("status input limit"));
        }
        self.next_id += 1;
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
        let failed = response.failed.is_some_and(|failed| !failed.is_null() && failed != false);
        let skipped = response.skipped.is_some_and(|skipped| !skipped.is_empty());
        if response.version != 1 || response.id != self.next_id || failed || skipped {
            if response.canonical_error == Some(true)
                && let Some(message) = response.error
            {
                return Err(io::Error::other(CanonicalError(message)));
            }
            let kind = input
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("request");
            let reason = response.error.map_or_else(String::new, |error| format!(": {error}"));
            return Err(io::Error::other(format!("the engine declined {kind}{reason}")));
        }
        serde_json::from_value(response.data).map_err(io::Error::other)
    }
}

#[derive(Debug)]
struct CanonicalError(String);
impl std::fmt::Display for CanonicalError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
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
