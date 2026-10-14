//! Engine errors rendered the way `pnpm-error-to-bit-error.ts` renders them.

use miette::Diagnostic;
use std::{error::Error, fmt, io};

/// A pnpm error with its `ERR_PNPM_*` code and hint. Wrapped in an
/// [`io::Error`]; callers that need the code (e.g. to enrich "No matching
/// version found") downcast with [`EngineError::from_io`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineError {
    pub code: Option<String>,
    pub message: String,
    pub hint: Option<String>,
}

impl EngineError {
    /// Capture a pacquet diagnostic.
    pub fn from_diagnostic<Diag: Diagnostic + ?Sized>(error: &Diag) -> Self {
        EngineError {
            code: error.code().map(|code| code.to_string()),
            message: error.to_string(),
            hint: error.help().map(|help| help.to_string()),
        }
    }

    /// The engine error an [`io::Error`] carries, if any.
    #[must_use]
    pub fn from_io(error: &io::Error) -> Option<&Self> {
        error.get_ref().and_then(|inner| inner.downcast_ref::<Self>())
    }

    #[must_use]
    pub fn into_io(self) -> io::Error {
        io::Error::other(self)
    }
}

/// `message`, then the hint after a blank line (`renderErrorMessage`). The
/// engine reports no package stack, so that part of the TypeScript rendering
/// never applies.
impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)?;
        match &self.hint {
            Some(hint) => write!(formatter, "\n\n{hint}"),
            None => Ok(()),
        }
    }
}

impl Error for EngineError {}

/// Convert a pacquet diagnostic into an [`io::Error`].
pub(super) fn diagnostic<Diag: Diagnostic + ?Sized>(error: &Diag) -> io::Error {
    EngineError::from_diagnostic(error).into_io()
}
