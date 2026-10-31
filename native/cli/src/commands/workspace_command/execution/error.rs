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
impl std::error::Error for WithDetails {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.error)
    }
}

/// Attach the released error inspection without applying message styles to it.
pub fn with_error_details(error: io::Error, details: String) -> io::Error {
    io::Error::new(error.kind(), WithDetails { error, details })
}

pub(in crate::commands) fn print(error: &io::Error, chalk: Chalk) {
    eprintln!("{}", chalk.red(&error.to_string()));
    if let Some(details) = downcast_details(error)
        .map(|details| details.trim_end_matches(['\r', '\n']))
        .filter(|details| !details.trim().is_empty())
    {
        eprintln!("{details}");
    }
}

fn downcast_details(error: &io::Error) -> Option<&str> {
    let mut current: Option<&(dyn std::error::Error + 'static)> = error
        .get_ref()
        .map(|inner| inner as &(dyn std::error::Error + 'static));
    while let Some(err) = current {
        if let Some(with_details) = err.downcast_ref::<WithDetails>() {
            return Some(with_details.details.as_str());
        }
        current = err.source();
    }
    None
}
