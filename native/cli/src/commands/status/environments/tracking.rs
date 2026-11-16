//! Project native tracking metadata into published classes before linking callbacks.
//!
//! Extends [`Environments`] with [`Environments::take_tracking_stdout`], [`Environments::identity_installation_info`], and [`Environments::identity_call`] over [`Host`].
use super::Environments;
use crate::host::Host;
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path};

impl Environments {
    /// Drains and returns already-buffered [`Host`] stdout before another metadata adapter reads it (see [`Environments::identity_installation_info`]).
    #[inline]
    pub(in crate::commands) fn take_tracking_stdout(&self) -> String {
        self.host.as_ref().map_or_else(String::new, Host::take_stdout)
    }

    /// Resolves installer [`bit_install::HostInfo`] and buffered [`Host`] stdout before native workers read the environment.
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

    /// Starts a tracking callback session ([`Environments::new`]) before installing its projected bitmap.
    #[inline]
    pub(in crate::commands) fn for_tracking() -> Self {
        Self::new()
    }

    /// Retain one [`Host`] provider session across native identity and path mutations (`self.host`).
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
        let host = self.host(root)?;
        let result = host.call(method, params);
        match result {
            Ok(value) => Ok((value, host.take_stdout())),
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
        if components.is_empty() {
            return Ok(json!([]));
        }
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
    #[inline]
    pub(in crate::commands) fn project_tracking(
        &mut self,
        root: &Path,
        bitmap: &Value,
        components: &[Value],
    ) -> io::Result<String> {
        self.project_tracking_with(root, &json!({"bitmap":bitmap,"components":components}))
    }

    /// Keep loaded identity classes while projecting later writes from the same command.
    #[inline]
    pub(in crate::commands) fn project_tracking_retained(
        &mut self,
        root: &Path,
        bitmap: &Value,
        components: &[Value],
    ) -> io::Result<String> {
        self.project_tracking_with(
            root,
            &json!({"bitmap":bitmap,"components":components,"retainLoaded":true}),
        )
    }

    fn project_tracking_with(&mut self, root: &Path, payload: &Value) -> io::Result<String> {
        if root.as_os_str().is_empty()
            || root
                .to_str()
                .is_some_and(|path| path.trim().is_empty())
        {
            return Err(io::Error::other("tracking workspace root is empty"));
        }
        let host = self.host(root)?;
        host.call("trackingProjectBitmap", payload)?;
        Ok(host.take_stdout())
    }

    /// Transfer the same provider and component caches to native package/link adapters.
    #[inline]
    pub(in crate::commands) fn into_tracking_host(mut self) -> Option<Host> {
        self.host.take()
    }
}
