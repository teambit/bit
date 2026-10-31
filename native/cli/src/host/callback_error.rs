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
        let cause = match cause.downcast::<Self>() {
            Ok(inner) => {
                if startup.is_empty() {
                    startup = inner.startup;
                }
                output.push_str(&inner.output);
                inner.cause
            }
            Err(cause) => cause,
        };
        startup.truncate(
            startup
                .trim_end_matches(['\0', '\r'])
                .len(),
        );
        output.truncate(
            output
                .trim_end_matches(['\0', '\r'])
                .len(),
        );
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
