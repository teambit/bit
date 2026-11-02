//! Retain observable callback output when a write command owns an adapter failure.
//!
//! [`CallbackError`] and [`CallbackError::wrap`] retain an [`io::Error`] cause alongside buffered startup and callback stdout.
use std::{error::Error, fmt, io};

/// Adapter failure wrapper preserving buffered startup and callback stdout alongside the [`io::Error`] cause.
#[derive(Debug)]
pub(crate) struct CallbackError {
    pub startup: String,
    pub output: String,
    cause: io::Error,
}

impl CallbackError {
    #[must_use]
    #[inline]
    pub(crate) fn wrap(cause: io::Error, mut startup: String, mut output: String) -> io::Error {
        let cause = match cause.downcast::<Self>() {
            Ok(inner) => {
                if startup.is_empty() {
                    startup = inner.startup;
                }
                if output.is_empty() {
                    output = inner.output;
                } else {
                    output.push_str(&inner.output);
                }
                inner.cause
            }
            Err(cause) => cause,
        };
        for field in [&mut startup, &mut output] {
            field.truncate(
                field
                    .trim_end_matches(['\0', '\r'])
                    .len(),
            );
        }
        io::Error::other(Self { startup, output, cause })
    }
}

impl fmt::Display for CallbackError {
    #[inline]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.cause.fmt(formatter)
    }
}

impl Error for CallbackError {
    #[inline]
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.cause)
    }
}
