//! The `BWS1` request frames of `bit-object-import`'s workspace session, the
//! protocol the Node.js glue sends through the `bit-workspace.node` addon.

use bit_object_import::WorkspaceSession;
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::Value;
use std::{io, thread};

const MAX_REQUEST: usize = 4 * 1024 * 1024;
const MAX_RESPONSE: usize = 32 * 1024 * 1024;

pub struct Engine {
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
            return Err(io::Error::other("status native request declined"));
        }
        serde_json::from_value(response.data).map_err(io::Error::other)
    }
}
