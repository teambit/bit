//! Retain the decompressor cause without changing ordinary checkout decline diagnostics.
//!
//! Wraps `flate2::DecompressError` in [`io::Error`] via [`retain`] so callers can inspect the underlying zlib [`message`].
use std::{fmt, io};
/// Decompression error wrapper preserving the underlying [`flate2::DecompressError`] for [`message`].
#[derive(Debug)]
struct Failure(flate2::DecompressError);
impl fmt::Display for Failure {
    #[inline]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("checkout invalid compressed object")
    }
}
impl std::error::Error for Failure {
    #[inline]
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.0)
    }
}
/// Wrap a [`flate2::DecompressError`] in an [`io::ErrorKind::InvalidData`] error preserving its cause.
#[inline]
pub(super) fn retain(error: flate2::DecompressError) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, Failure(error))
}
/// Return `true` when `ch` is whitespace or a control character to strip from zlib error messages.
#[inline]
const fn is_trim_char(ch: char) -> bool {
    ch.is_whitespace() || ch.is_control()
}
/// Extract the trimmed underlying zlib error message from `error` when wrapped in [`Failure`].
#[inline]
pub(crate) fn message(error: &io::Error) -> Option<&str> {
    error
        .get_ref()?
        .downcast_ref::<Failure>()?
        .0
        .message()
        .map(|msg| msg.trim_matches(is_trim_char))
        .filter(|message| !message.is_empty())
}
