//! Project native tracking metadata into published classes before linking callbacks.
use super::Environments;
use crate::host::Host;
use serde_json::{Value, json};
use std::{io, path::Path};

impl Environments {
    /// Start a tracking callback session before installing its projected bitmap.
    pub(in crate::commands) fn for_tracking() -> Self {
        Self::new()
    }

    /// Ask only the published semantic parser; Rust publishes the returned cache metadata.
    pub(in crate::commands) fn tracking_docs(
        &mut self,
        root: &Path,
        components: &[Value],
    ) -> io::Result<Value> {
        self.host(root)?
            .call("trackingDocs", &json!({"components":components}))
    }

    /// Resolve only published environment configuration metadata before native tracking.
    pub(in crate::commands) fn tracking_env_config(
        &mut self,
        root: &Path,
        env: &str,
    ) -> io::Result<Value> {
        self.host(root)?
            .call("trackingEnvConfig", &json!({"env":env}))
    }

    /// Replace only in-memory tracking records; the native plan retains disk publication.
    pub(in crate::commands) fn project_tracking(
        &mut self,
        root: &Path,
        bitmap: &Value,
        components: &[Value],
    ) -> io::Result<String> {
        let host = self.host(root)?;
        host.call("trackingProjectBitmap", &json!({"bitmap":bitmap,"components":components}))?;
        Ok(host.take_stdout())
    }

    /// Transfer the same provider and component caches to native package/link adapters.
    pub(in crate::commands) fn into_tracking_host(mut self) -> Option<Host> {
        self.host.take()
    }
}
