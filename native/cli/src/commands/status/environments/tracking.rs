//! Project native tracking metadata into published classes before linking callbacks.
use super::Environments;
use crate::host::Host;
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path};

impl Environments {
    /// Preserve already-buffered provider output before another metadata adapter drains it.
    pub(in crate::commands) fn take_tracking_stdout(&self) -> String {
        self.host.as_ref().map_or_else(String::new, Host::take_stdout)
    }

    /// Resolve installer process facts before native workers can read the environment.
    pub(in crate::commands) fn identity_installation_info(
        &mut self,
        root: &Path,
        args: &[OsString],
    ) -> io::Result<(bit_install::HostInfo, String)> {
        let argv = args
            .iter()
            .map(|arg| {
                arg.to_str()
                    .map(str::to_owned)
                    .ok_or_else(|| io::Error::other("installation argv"))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let terminal = crate::commands::install::Terminal::detect(&argv);
        let host = self.host(root)?;
        match crate::commands::install::host_info(host, &terminal) {
            Ok(info) => Ok((info, host.take_stdout())),
            Err(error) => Err(self.failure(error)),
        }
    }

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
        let method = method.trim();
        if method.is_empty() {
            return Err(io::Error::other("identity callback method is empty"));
        }
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
        native_cache_only: bool,
    ) -> io::Result<Value> {
        self.host(root)?
            .call(
                "trackingDocs",
                &json!({"components":components,"nativeCacheOnly":native_cache_only}),
            )
    }

    /// Resolve only published environment configuration metadata before native tracking.
    pub(in crate::commands) fn tracking_env_config(
        &mut self,
        root: &Path,
        env: &str,
    ) -> io::Result<Value> {
        let env = env.trim();
        if env.is_empty() {
            return Err(io::Error::other("tracking environment id is empty"));
        }
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
