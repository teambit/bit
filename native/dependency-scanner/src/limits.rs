//! Request ([`REQUEST_BYTES`]), source byte ([`SOURCE_BYTES`]), and batch file size ([`BATCH_FILES`]) limits.
//!
//! [`read_source`] bounds individual source file reads and JSON request payloads before parsing.

use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

/// Maximum allowed JSON batch request size (`8 MiB`).
pub(crate) const REQUEST_BYTES: usize = 8 * 1024 * 1024;
/// Maximum allowed size (`1 MiB`) for a single scanned source file.
pub(crate) const SOURCE_BYTES: usize = 1024 * 1024;
/// Maximum number of files (`4096`) accepted in a single embedded batch scan request.
pub(crate) const BATCH_FILES: usize = 4096;

/// Construct an [`io::ErrorKind::FileTooLarge`] error when a source file exceeds [`SOURCE_BYTES`].
#[inline]
fn too_large_error() -> io::Error {
    io::Error::new(io::ErrorKind::FileTooLarge, "source exceeds 1 MiB limit; use legacy fallback")
}

/// Reads the UTF-8 source [`File`] at `path` ([`Path`]), rejecting files larger than [`SOURCE_BYTES`].
#[inline]
pub(crate) fn read_source(path: &Path) -> io::Result<String> {
    let file = File::open(path)?;
    let size = file
        .metadata()
        .ok()
        .map(|meta| meta.len());
    if size.is_some_and(|len| len > SOURCE_BYTES as u64) {
        return Err(too_large_error());
    }
    let capacity = size
        .and_then(|len| usize::try_from(len).ok())
        .map_or(0, |len| len.saturating_add(1));
    let mut bytes = Vec::with_capacity(capacity);
    file.take((SOURCE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > SOURCE_BYTES {
        return Err(too_large_error());
    }
    String::from_utf8(bytes).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

#[inline]
pub(crate) fn source<'source>(
    inline: Option<&'source str>,
    path: &Path,
) -> io::Result<std::borrow::Cow<'source, str>> {
    match inline {
        Some(source) if source.len() > SOURCE_BYTES => Err(too_large_error()),
        Some(source) => Ok(std::borrow::Cow::Borrowed(source)),
        None => {
            let trimmed = path.to_str().map_or(path, |raw| Path::new(raw.trim()));
            read_source(trimmed).map(std::borrow::Cow::Owned)
        }
    }
}
