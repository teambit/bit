//! Retain the decompressor cause without changing ordinary checkout decline diagnostics.
use std::{fmt, io};
#[derive(Debug)]
struct Failure(flate2::DecompressError);
impl fmt::Display for Failure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("checkout invalid compressed object")
    }
}
impl std::error::Error for Failure {}
pub(super) fn retain(error: flate2::DecompressError) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, Failure(error))
}
pub(crate) fn message(error: &io::Error) -> Option<&str> {
    error
        .get_ref()?
        .downcast_ref::<Failure>()?
        .0
        .message()
}
