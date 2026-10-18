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

    /// Retain one provider session across native identity and path mutations.
    pub(in crate::commands) fn identity_call(
        &mut self,
        root: &Path,
        method: &str,
        params: &Value,
    ) -> io::Result<(Value, String)> {
        let result = self.host(root)?.call(method, params);
        match result {
            Ok(value) => Ok((value, self.host(root)?.take_stdout())),
            Err(error) => Err(self.failure(error)),
        }
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

    /// Keep loaded identity classes while projecting later writes from the same command.
    pub(in crate::commands) fn project_tracking_retained(
        &mut self,
        root: &Path,
        bitmap: &Value,
        components: &[Value],
    ) -> io::Result<String> {
        let host = self.host(root)?;
        host.call(
            "trackingProjectBitmap",
            &json!({"bitmap":bitmap,"components":components,"retainLoaded":true}),
        )?;
        Ok(host.take_stdout())
    }

    /// Transfer the same provider and component caches to native package/link adapters.
    pub(in crate::commands) fn into_tracking_host(mut self) -> Option<Host> {
        self.host.take()
    }
}
