//! Engine errors rendered the way `pnpm-error-to-bit-error.ts` renders them.
//!
//! Preserves `ERR_PNPM_*` diagnostic codes and optional help hints in [`EngineError`].
//! Wraps [`Diagnostic`] failures in [`io::Error`] for downstream error enrichment.

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
    /// Convert a `pacquet` [`Diagnostic`] into an [`EngineError`] with `ERR_PNPM_*` code and hint.
    pub fn from_diagnostic<Diag: Diagnostic + ?Sized>(error: &Diag) -> Self {
        let non_empty = |text: Box<dyn fmt::Display + '_>| {
            let rendered = text.to_string();
            let trimmed = rendered.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.len() == rendered.len() {
                Some(rendered)
            } else {
                Some(trimmed.to_owned())
            }
        };
        let raw_message = error.to_string();
        let trimmed_msg = raw_message.trim();
        let message = if trimmed_msg.len() == raw_message.len() {
            raw_message
        } else {
            trimmed_msg.to_owned()
        };
        Self {
            code: error.code().and_then(non_empty),
            message,
            hint: error.help().and_then(non_empty),
        }
    }

    /// The engine error an [`io::Error`] carries, if any.
    #[must_use]
    #[inline]
    pub fn from_io(error: &io::Error) -> Option<&Self> {
        error.get_ref().and_then(|inner| inner.downcast_ref::<Self>())
    }

    /// Wrap this [`EngineError`] into an [`io::Error`].
    #[must_use]
    #[inline]
    pub fn into_io(self) -> io::Error {
        io::Error::other(self)
    }
}

/// `message`, then the hint after a blank line (`renderErrorMessage`). The
/// engine reports no package stack, so that part of the TypeScript rendering
/// never applies.
impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = self.message.trim();
        formatter.write_str(message)?;
        match self.hint
            .as_deref()
            .map(str::trim)
            .filter(|hint| !hint.is_empty() && !message.ends_with(hint))
        {
            Some(hint) => write!(formatter, "\n\n{hint}"),
            None => Ok(()),
        }
    }
}

impl Error for EngineError {}

/// Convert a pacquet diagnostic into an [`io::Error`].
#[inline]
pub(super) fn diagnostic<Diag: Diagnostic + ?Sized>(error: &Diag) -> io::Error {
    EngineError::from_diagnostic(error).into_io()
}
