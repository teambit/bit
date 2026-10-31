//! Shared request path, count and object-identity validation.

use super::MAX_FILES;
use sha1::{Digest, Sha1};
use std::{io, path::Path};

pub(super) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
pub(super) fn path(path: &Path) -> io::Result<()> {
    let name = path.to_str().ok_or_else(|| invalid("workspace non-UTF8 path"))?;
    if name.trim().is_empty()
        || !path.is_absolute()
        || name.len() > 32768
        || name.chars().any(char::is_control)
    {
        return Err(invalid("workspace invalid absolute path"));
    }
    Ok(())
}
pub(super) fn count(count: usize) -> io::Result<()> {
    if count > MAX_FILES { Err(invalid("workspace file count limit")) } else { Ok(()) }
}
pub(super) fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
pub(super) fn expected_hash(hash: &str) -> io::Result<[u8; 20]> {
    crate::merge_history::hash(hash.trim())
}
