//! Inspect Windows link identity ([`single`], [`is_single_regular_handle`], [`OPEN_REPARSE_POINT`], [`REPARSE_POINT`]) without following reparse points before copying.

use std::{fs::OpenOptions, io, os::windows::fs::OpenOptionsExt, path::Path};

/// Windows file-attribute flag bit (`FILE_ATTRIBUTE_DEVICE`) for device files.
const DEVICE: u64 = 0x0040;
/// Windows file-attribute flag bit (`FILE_ATTRIBUTE_DIRECTORY`) for directories.
const DIRECTORY: u64 = 0x0010;
/// Windows file-attribute flag bit (`FILE_ATTRIBUTE_OFFLINE`) for offline files.
const OFFLINE: u64 = 0x1000;
/// Windows `CreateFile` flag (`FILE_FLAG_OPEN_REPARSE_POINT`) disabling reparse-point traversal.
const OPEN_REPARSE_POINT: u32 = 0x0020_0000;
/// Windows file-attribute flag bit (`FILE_ATTRIBUTE_REPARSE_POINT`) for symlinks and junctions.
const REPARSE_POINT: u64 = 0x0400;

/// Returns whether `path` ([`Path`]) is a single-link regular file without [`REPARSE_POINT`] or [`DEVICE`] attributes.
#[inline]
pub(super) fn single(path: &Path) -> io::Result<bool> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(path)?;
    let info = winapi_util::file::information(&file)?;
    Ok(is_single_regular_handle(&info))
}

/// Returns `true` when `info` has a single link and no [`DIRECTORY`], [`DEVICE`], [`REPARSE_POINT`], or [`OFFLINE`] flags.
#[inline]
fn is_single_regular_handle(info: &winapi_util::file::Information) -> bool {
    info.number_of_links() == 1
        && info.file_attributes() & (DIRECTORY | DEVICE | REPARSE_POINT | OFFLINE) == 0
}
