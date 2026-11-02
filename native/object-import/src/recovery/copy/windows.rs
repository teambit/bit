//! Inspect Windows link identity ([`single`]) without following reparse points before copying.

use std::{fs::OpenOptions, io, os::windows::fs::OpenOptionsExt, path::Path};

const DEVICE: u64 = 0x0040;
const DIRECTORY: u64 = 0x0010;
const OFFLINE: u64 = 0x1000;
const OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const REPARSE_POINT: u64 = 0x0400;

/// Returns whether `path` is a single-link regular file without reparse-point or device attributes.
#[inline]
pub(super) fn single(path: &Path) -> io::Result<bool> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(path)?;
    let info = winapi_util::file::information(&file)?;
    Ok(is_single_regular_handle(&info))
}

/// Returns `true` when `info` has a single link and no directory, device, reparse-point, or offline flags.
#[inline]
fn is_single_regular_handle(info: &winapi_util::file::Information) -> bool {
    info.number_of_links() == 1
        && info.file_attributes() & (DIRECTORY | DEVICE | REPARSE_POINT | OFFLINE) == 0
}
