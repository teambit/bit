//! Shared request [`path`], [`count`], and [`invalid`] validation helpers.

use super::MAX_FILES;
use sha1::{Digest, Sha1};
use std::{io, path::Path};

/// Constructs an `InvalidData` [`io::Error`] with `message`.
#[inline]
pub(super) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
#[inline]
pub(super) fn path(path: &Path) -> io::Result<()> {
    let name = path.to_str().ok_or_else(|| invalid("workspace non-UTF8 path"))?;
    if name.len() > 32768
        || !path.is_absolute()
        || name.trim().is_empty()
        || name.chars().any(char::is_control)
        || path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(invalid("workspace invalid absolute path"));
    }
    Ok(())
}
#[inline]
pub(super) fn count(count: usize) -> io::Result<()> {
    if count > MAX_FILES { Err(invalid("workspace file count limit")) } else { Ok(()) }
}
#[inline]
pub(super) fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
#[inline]
pub(super) fn expected_hash(hash: &str) -> io::Result<[u8; 20]> {
    crate::merge_history::hash(hash.trim())
}
