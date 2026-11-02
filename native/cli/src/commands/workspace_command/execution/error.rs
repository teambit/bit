//! Keep qualified diagnostic details outside the command error's red message.
//!
//! [`WithDetails`] pairs an [`io::Error`] message with uncolored diagnostic detail lines for [`Chalk`] output.
use crate::commands::color::Chalk;
use std::{
    fmt,
    io::{self, Write},
};

#[derive(Debug)]
struct WithDetails {
    error: io::Error,
    details: String,
}
impl fmt::Display for WithDetails {
    #[inline]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}
impl std::error::Error for WithDetails {
    #[inline]
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.error)
    }
}

/// Attach the released error inspection without applying message styles to it.
#[must_use]
#[inline]
pub fn with_error_details(error: io::Error, details: String) -> io::Error {
    io::Error::new(error.kind(), WithDetails { error, details })
}

pub(in crate::commands) fn print(error: &io::Error, chalk: Chalk) {
    let mut stderr = io::stderr().lock();
    let _ = writeln!(stderr, "{}", chalk.red(&error.to_string()));
    if let Some(details) = downcast_details(error)
        .map(|details| details.trim_end_matches(['\r', '\n']))
        .filter(|details| !details.trim().is_empty())
    {
        let _ = writeln!(stderr, "{details}");
    }
}

#[inline]
fn downcast_details(error: &io::Error) -> Option<&str> {
    std::iter::successors(
        error
            .get_ref()
            .map(|inner| inner as &(dyn std::error::Error + 'static)),
        |err| err.source(),
    )
    .find_map(|err| err.downcast_ref::<WithDetails>())
    .map(|with_details| with_details.details.as_str())
}
