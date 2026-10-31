//! Inner colors of the released tracking exceptions, before the CLI's outer red error.
#[cfg(test)]
mod tests;

use crate::commands::color::Chalk;
use std::{error::Error, fmt, io};

const NO_FILES: &str = "warning: no files to add";
const IGNORED: &str = ", the following files were ignored: ";

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
    if !chalk.enabled()
        || error
            .get_ref()
            .is_some_and(
                <dyn Error + Send + Sync>::is::<crate::host::callback_error::CallbackError>,
            )
    {
        return error;
    }
    let message = error.to_string();
    if !filesystem_message(&message) {
        return error;
    }
    io::Error::new(error.kind(), Colored { message: chalk.red(&message), source: error })
}
fn filesystem_message(message: &str) -> bool {
    let trimmed = message.trim_start();
    trimmed.starts_with("ENOTDIR: not a directory, mkdir '")
        || trimmed.starts_with("EISDIR: illegal operation on a directory, rename '")
        || trimmed.starts_with("EPERM: operation not permitted,")
}
fn message_color(message: &str, chalk: Chalk) -> Option<String> {
    if message == NO_FILES {
        return Some(chalk.yellow(NO_FILES));
    }
    if let Some(files) = message
        .strip_prefix(NO_FILES)
        .and_then(|suffix| suffix.strip_prefix(IGNORED))
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
