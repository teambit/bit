//! Reuse identity providers when bulk renaming invokes the native package manager.
use super::ProjectedLinker;
use crate::commands::{installation::Installer, status::environments::Environments};
use serde_json::json;
use std::{ffi::OsString, io, path::Path, sync::Arc};

impl ProjectedLinker {
    /// Prepare process facts before native inventory or dependency worker threads start.
    pub(in crate::commands) fn prepare_with_installation(
        root: &Path,
        args: &[OsString],
    ) -> io::Result<Self> {
        if root.as_os_str().is_empty() || root.to_string_lossy().trim().is_empty() {
            return Err(io::Error::other("identity installation workspace root is empty"));
        }
        Installer::validate_workspace(root)?;
        let mut environment = Environments::for_tracking().for_checkout();
        let (info, stdout) = environment.identity_installation_info(root, args)?;
        let mut linker = Self {
            environment: Some(environment),
            stdout,
            retained: super::retained::Retained::default(),
            installation: Some(info),
        };
        linker.call(root, "identityBootstrap", &json!({}))?;
        Ok(linker)
    }

    /// `RenamingMain.installDepsGracefully` uses the original provider session.
    pub(in crate::commands) fn install_scope_rename(&mut self, root: &Path) -> io::Result<()> {
        self.with_installer(|installer| installer.install_scope_rename(root))
    }

    pub(in crate::commands) fn install_fork(&mut self, root: &Path) -> io::Result<()> {
        self.with_installer(|installer| installer.install_fork(root))
    }

    /// Keep native recovery imports and installation on the original provider session.
    pub(in crate::commands) fn with_installer<ResultValue>(
        &mut self,
        action: impl FnOnce(Installer) -> io::Result<ResultValue>,
    ) -> io::Result<ResultValue> {
        let mut info = self.installation
            .clone()
            .ok_or_else(|| {
                io::Error::other("identity installation facts were not prepared before workers")
            })?;
        let file_id = crate::commands::workspace_command::file_id();
        if file_id.trim().is_empty() {
            return Err(io::Error::other("identity installation file id is empty"));
        }
        info.file_id = file_id;
        let host = self.environment
            .take()
            .and_then(Environments::into_tracking_host)
            .ok_or_else(|| io::Error::other("identity installation provider session"))?;
        let host = Arc::new(host);
        let result = action(Installer::from_host(Arc::clone(&host), info));
        self.restore(host)?;
        self.finish(result)
    }
}
