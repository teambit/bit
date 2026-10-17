//! Inspect Windows link identity without following reparse points before copying.
use std::{fs::OpenOptions, io, os::windows::fs::OpenOptionsExt, path::Path};

const OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const REPARSE_POINT: u64 = 0x0400;

pub(super) fn single(path: &Path) -> io::Result<bool> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(path)?;
    let info = winapi_util::file::information(&file)?;
    Ok(info.number_of_links() == 1 && info.file_attributes() & REPARSE_POINT == 0)
}
