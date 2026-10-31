//! Handler-specific error rendering without restarting a command after provider effects.
mod colors;

use crate::{
    commands::{color::Chalk, status::autosync::Startup, workspace_command},
    native::Outcome,
};
use std::{ffi::OsString, io, path::Path};
pub(super) fn failure(
    root: &Path,
    args: &[OsString],
    json: bool,
    startup: &Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    let error = colors::error(error, Chalk::detect(args));
    if !json {
        return workspace_command::checkout_lifecycle::failure(root, args, "add", startup, error);
    }
    workspace_command::checkout_lifecycle::before(startup)?;
    let callback = downcast_callback(&error);
    if let Some(callback) = callback {
        print!("{}", callback.startup);
    }
    let captured = callback.map_or_else(String::new, |callback| callback.output.clone());
    workspace_command::execute_json(root, args, "add", |_| {
        workspace_command::checkout_lifecycle::loaded(startup);
        print!("{captured}");
        Err(error)
    })
}

fn downcast_callback(error: &io::Error) -> Option<&crate::host::callback_error::CallbackError> {
    error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<crate::host::callback_error::CallbackError>())
}

/// Released filesystem error formatting nests red within the command handler's red.
pub(super) fn link_error(error: io::Error, chalk: Chalk) -> io::Error {
    colors::native_io(error, chalk)
}
