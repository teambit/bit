//! Keep qualified diagnostic details outside the command error's red message.
use crate::commands::color::Chalk;
use std::{fmt, io};

#[derive(Debug)]
struct WithDetails {
    error: io::Error,
    details: String,
}
impl fmt::Display for WithDetails {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}
impl std::error::Error for WithDetails {}

/// Attach the released error inspection without applying message styles to it.
pub fn with_error_details(error: io::Error, details: String) -> io::Error {
    io::Error::new(error.kind(), WithDetails { error, details })
}

pub(in crate::commands) fn print(error: &io::Error, chalk: Chalk) {
    eprintln!("{}", chalk.red(&error.to_string()));
    if let Some(details) = downcast_details(error).filter(|details| !details.trim().is_empty()) {
        eprintln!("{details}");
    }
}

fn downcast_details(error: &io::Error) -> Option<&str> {
    error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<WithDetails>())
        .map(|with_details| with_details.details.as_str())
}
