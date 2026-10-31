//! A remote Source decode failure carries its real scope and original inflate cause.
#[cfg(test)]
mod tests;
use std::{fmt, io};
#[derive(Debug)]
struct Failure {
    scope: String,
    cause: io::Error,
}
impl fmt::Display for Failure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.cause.fmt(formatter)
    }
}
impl std::error::Error for Failure {}
pub(super) fn mark(scope: Option<&str>, error: io::Error) -> io::Error {
    match scope
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        Some(scope) if crate::checkout::repository::inflate_message(&error).is_some() => {
            io::Error::new(error.kind(), Failure { scope: scope.to_owned(), cause: error })
        }
        _ => error,
    }
}
pub(crate) fn message(error: &io::Error) -> Option<String> {
    let failure = error.get_ref()?.downcast_ref::<Failure>()?;
    let message = crate::checkout::repository::inflate_message(&failure.cause)?;
    Some(format!(
        "remote {} responded with the following error:\nfatal: zlib.inflate has failed with an error: \"{message}\"\ntry running bit import --all-history to fix the corrupted objects",
        failure.scope.trim(),
    ))
}
