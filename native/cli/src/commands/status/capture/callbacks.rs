//! Retain permitted callback state and output alongside the native capture.

use super::{CacheWrites, Capture};
use serde_json::Value;
use std::io;

#[derive(Default)]
pub(super) struct Callbacks {
    pub(super) host: Option<crate::host::Host>,
    directories: Vec<tempfile::TempDir>,
    pub(super) snapshot_data: std::collections::HashMap<String, Value>,
    pub(super) load_stdout: std::sync::Mutex<String>,
    pub(super) issue_stdout: std::sync::Mutex<String>,
    pub(super) startup_stdout: std::sync::Mutex<String>,
}

impl CacheWrites {
    pub(in crate::commands::status) fn retain_snapshot_data(
        &mut self,
        identity: &str,
        data: Value,
    ) {
        self.callbacks.snapshot_data.insert(identity.to_owned(), data);
    }

    pub(in crate::commands::status) fn retain_callback_directory(
        &mut self,
        directory: tempfile::TempDir,
    ) {
        self.callbacks.directories.push(directory);
    }

    pub(in crate::commands::status) fn retain_callback_host(
        &mut self,
        host: Option<crate::host::Host>,
    ) {
        self.callbacks.host = host;
    }

    pub(in crate::commands::status) fn retain_callback_proofs(&mut self, proofs: &[Value]) {
        self.environment_reads.extend(proofs.iter().cloned());
    }

    pub(in crate::commands::status) fn retain_callback_stdout(&self, output: &str) {
        self.callbacks.load_stdout
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push_str(output);
    }

    pub(in crate::commands::status) fn retain_callback_startup(&self, output: &str) {
        self.callbacks.startup_stdout
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push_str(output);
    }
}

/// Custom issue slots consume the complete Rust issue facts on hydrated classes.
pub fn issue_callbacks(
    context: &Value,
    capture: &Capture,
    rows: &[Value],
) -> io::Result<Vec<Value>> {
    match &capture.cache.callbacks.host {
        Some(host) => {
            let (rows, stdout) =
                super::super::environments::callbacks::issue_callbacks(host, rows, context)?;
            capture.cache.callbacks.issue_stdout
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push_str(&stdout);
            Ok(rows)
        }
        None => Ok(rows.to_vec()),
    }
}

/// Workspace loading failures retained by the published provider host.
pub fn workspace_issues(capture: &Capture) -> io::Result<Vec<String>> {
    match &capture.cache.callbacks.host {
        Some(host) => {
            serde_json::from_value(host.call("statusWorkspaceIssues", &serde_json::json!({}))?)
                .map_err(io::Error::other)
        }
        None => Ok(Vec::new()),
    }
}

/// Output produced by permitted Harmony callbacks, buffered until command preflight completes.
pub fn callback_load_stdout(capture: &Capture) -> String {
    capture.cache.callbacks.load_stdout
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

pub fn callback_issue_stdout(capture: &Capture) -> String {
    capture.cache.callbacks.issue_stdout
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

pub fn callback_startup_stdout(capture: &Capture) -> String {
    capture.cache.callbacks.startup_stdout
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

/// Transfer the retained provider session to a later native operation in the same command.
pub(in crate::commands) fn take_callback_environment(
    capture: &mut Capture,
) -> Option<super::super::environments::Environments> {
    capture.cache.callbacks.host.take().map(super::super::environments::Environments::from_host)
}
