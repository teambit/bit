//! A remote Source decode failure carries its real scope and original inflate cause.
//!
//! Formats remote scope zlib inflation errors ([`mark`]) with the canonical `--all-history` hint.
#[cfg(test)]
mod tests;
use std::{fmt, io};
/// Remote scope inflate error paired with the originating scope name.
#[derive(Debug)]
struct Failure {
    scope: String,
    cause: io::Error,
}
impl fmt::Display for Failure {
    #[inline]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.cause.fmt(formatter)
    }
}
impl std::error::Error for Failure {}
/// Annotate `error` with its originating `scope` when `error` is a zlib inflate failure.
#[inline]
pub(super) fn mark(scope: Option<&str>, error: io::Error) -> io::Error {
    if let Some(scope) = scope
        .map(str::trim)
        .filter(|name| !name.is_empty())
        && crate::checkout::repository::inflate_message(&error).is_some()
    {
        return io::Error::new(error.kind(), Failure { scope: scope.to_owned(), cause: error });
    }
    error
}
/// Format a remote scope zlib inflate error message with the `--all-history` recovery hint.
#[inline]
pub(crate) fn message(error: &io::Error) -> Option<String> {
    let failure = error.get_ref()?.downcast_ref::<Failure>()?;
    let scope = failure.scope.trim();
    let message = crate::checkout::repository::inflate_message(&failure.cause)?.trim();
    if scope.is_empty() || message.is_empty() {
        return None;
    }
    Some(format!(
        "remote {scope} responded with the following error:\nfatal: zlib.inflate has failed with an error: \"{message}\"\ntry running bit import --all-history to fix the corrupted objects",
    ))
}
