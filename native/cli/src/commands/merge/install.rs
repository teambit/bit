//! Native installer preparation before the retained merge lifecycle starts.
//!
//! [`start`] initializes an optional [`Installer`] when `--skip-dependency-installation` is not requested.
use crate::commands::installation::Installer;
use std::{io, path::Path};

#[inline]
pub(in crate::commands) fn start(
    root: &Path,
    argv: &[&str],
    skip: bool,
) -> io::Result<Option<Installer>> {
    if skip
        || root.as_os_str().is_empty()
        || argv
            .iter()
            .all(|arg| arg.trim().is_empty())
        || !root.is_dir()
    {
        Ok(None)
    } else {
        Installer::start(root, argv).map(Some)
    }
}
