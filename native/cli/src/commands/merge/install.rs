//! Native installer preparation before the retained merge lifecycle starts.
use crate::commands::installation::Installer;
use std::{io, path::Path};

pub(in crate::commands) fn start(
    root: &Path,
    argv: &[&str],
    skip: bool,
) -> io::Result<Option<Installer>> {
    if skip || root.as_os_str().is_empty() {
        Ok(None)
    } else {
        Installer::start(root, argv).map(Some)
    }
}
