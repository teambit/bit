//! Handler-specific [`Outcome`] error rendering without restarting a command after provider effects.
//!
//! Formats [`failure`] and [`link_error`] responses in text and `--json` modes with [`colors`] and [`Startup`] hooks.
mod colors;

use crate::{
    commands::{color::Chalk, status::autosync::Startup, workspace_command},
    native::Outcome,
};
use std::{ffi::OsString, io, path::Path};
/// Renders a `bit add` failure [`Outcome`] after provider effects in text or `--json` mode via [`colors::error`] and [`downcast_callback`].
pub(super) fn failure(
    root: &Path,
    args: &[OsString],
    json: bool,
    startup: &Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    let error = colors::error(error, Chalk::detect(args));
    if root
        .as_os_str()
        .as_encoded_bytes()
        .iter()
        .all(u8::is_ascii_whitespace)
    {
        return Err(error);
    }
    if !json {
        return workspace_command::checkout_lifecycle::failure(root, args, "add", startup, error);
    }
    workspace_command::checkout_lifecycle::before(startup)?;
    let callback = downcast_callback(&error);
    if let Some(callback) = callback
        && !callback.startup.is_empty()
    {
        print!("{}", callback.startup);
    }
    let captured = callback.map_or_else(String::new, |callback| callback.output.clone());
    workspace_command::execute_json(root, args, "add", |_| {
        workspace_command::checkout_lifecycle::loaded(startup);
        print!("{captured}");
        Err(error)
    })
}

/// Walks the error source chain of `error` to locate an embedded [`crate::host::callback_error::CallbackError`].
#[inline]
fn downcast_callback(error: &io::Error) -> Option<&crate::host::callback_error::CallbackError> {
    std::iter::successors(
        error
            .get_ref()
            .map(|inner| inner as &(dyn std::error::Error + 'static)),
        |inner| (*inner).source(),
    )
    .take(32)
    .find_map(|inner| inner.downcast_ref::<crate::host::callback_error::CallbackError>())
}

/// Wraps native filesystem link errors in inner red [`Chalk`] styling via [`colors::native_io`].
#[inline]
pub(super) fn link_error(error: io::Error, chalk: Chalk) -> io::Error {
    colors::native_io(error, chalk)
}
