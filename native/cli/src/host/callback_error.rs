//! Retain observable callback output when a write command owns an adapter failure.
use std::{error::Error, fmt, io};

#[derive(Debug)]
pub(crate) struct CallbackError {
    pub startup: String,
    pub output: String,
    cause: io::Error,
}

impl CallbackError {
    pub(crate) fn wrap(cause: io::Error, mut startup: String, mut output: String) -> io::Error {
        startup.truncate(startup.trim_end_matches('\0').len());
        output.truncate(output.trim_end_matches('\0').len());
        io::Error::other(Self { startup, output, cause })
    }
}

impl fmt::Display for CallbackError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.cause.fmt(formatter)
    }
}

impl Error for CallbackError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.cause)
    }
}
