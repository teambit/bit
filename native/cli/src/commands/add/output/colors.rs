//! Inner [`Chalk`] colors of the released tracking exceptions, before the CLI's outer red error.
//!
//! Exposes [`error`] and [`native_io`] to style invalid-input and filesystem diagnostics.
#[cfg(test)]
mod tests;

use crate::commands::color::Chalk;
use std::{error::Error, fmt, io};

const NO_FILES: &str = "warning: no files to add";
const IGNORED: &str = ", the following files were ignored: ";

/// Applies inner [`Chalk`] styling to `InvalidInput` tracking errors when colors are enabled.
pub(super) fn error(error: io::Error, chalk: Chalk) -> io::Error {
    if !chalk.enabled() || error.kind() != io::ErrorKind::InvalidInput {
        return error;
    }
    let message = error.to_string();
    let Some(message) = message_color(&message, chalk) else {
        return error;
    };
    io::Error::new(error.kind(), Colored { message, source: error })
}
pub(super) fn native_io(error: io::Error, chalk: Chalk) -> io::Error {
    if !chalk.enabled() || has_colored_or_callback(&error) {
        return error;
    }
    let message = error.to_string();
    if !filesystem_message(&message) {
        return error;
    }
    io::Error::new(error.kind(), Colored { message: chalk.red(&message), source: error })
}
#[inline]
fn has_colored_or_callback(error: &io::Error) -> bool {
    std::iter::successors(
        error
            .get_ref()
            .map(|inner| inner as &(dyn Error + 'static)),
        |inner| (*inner).source(),
    )
    .take(32)
    .any(|inner| inner.is::<crate::host::callback_error::CallbackError>() || inner.is::<Colored>())
}
#[inline]
fn filesystem_message(message: &str) -> bool {
    let trimmed = message.trim_start();
    trimmed.starts_with("ENOTDIR: not a directory, mkdir '")
        || trimmed.starts_with("EISDIR: illegal operation on a directory, rename '")
        || trimmed.starts_with("EPERM: operation not permitted,")
}
fn message_color(message: &str, chalk: Chalk) -> Option<String> {
    let message = message.trim();
    if message == NO_FILES {
        return Some(chalk.yellow(NO_FILES));
    }
    if let Some(files) = message
        .strip_prefix(NO_FILES)
        .and_then(|suffix| suffix.strip_prefix(IGNORED))
        .map(str::trim)
        .filter(|files| !files.is_empty())
    {
        return Some(format!(
            "{}{}",
            chalk.yellow(NO_FILES),
            chalk.yellow(&format!("{IGNORED}{}", chalk.bold(files))),
        ));
    }
    if message.starts_with(r#"directory ""#) && message.ends_with(r#"" is empty, no files to add"#)
    {
        return Some(chalk.yellow(message));
    }
    None
}

#[derive(Debug)]
struct Colored {
    message: String,
    source: io::Error,
}
impl fmt::Display for Colored {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}
impl Error for Colored {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}
