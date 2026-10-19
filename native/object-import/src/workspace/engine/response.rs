//! Bounded JSON response buffer for the workspace protocol.
#[cfg(test)]
mod tests;
use super::{MAX_OUTPUT, invalid};
use std::io::{self, Write};

#[derive(Debug)]
struct CanonicalError {
    message: String,
    progress: Option<serde_json::Value>,
}

impl std::fmt::Display for CanonicalError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.message.fmt(formatter)
    }
}
impl std::error::Error for CanonicalError {}

pub(super) fn canonical(message: String) -> io::Error {
    io::Error::other(CanonicalError { message, progress: None })
}

pub(super) fn with_progress(error: io::Error, progress: serde_json::Value) -> io::Error {
    if !is_canonical(&error) {
        return error;
    }
    io::Error::other(CanonicalError { message: error.to_string(), progress: Some(progress) })
}

pub(super) fn failure_data(error: &io::Error) -> Option<serde_json::Value> {
    let canonical = error.get_ref()?.downcast_ref::<CanonicalError>()?;
    canonical.progress
        .as_ref()
        .map(|progress| serde_json::json!({"progress":progress}))
}

pub(super) fn is_canonical(error: &io::Error) -> bool {
    error.get_ref().is_some_and(<dyn std::error::Error + Send + Sync>::is::<CanonicalError>)
}

pub(super) struct Output(pub(super) Vec<u8>);
impl Write for Output {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len() + bytes.len() > MAX_OUTPUT {
            return Err(invalid("workspace output limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
