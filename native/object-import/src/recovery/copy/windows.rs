//! Inspect Windows link identity without following reparse points before copying.
use std::{fs::OpenOptions, io, os::windows::fs::OpenOptionsExt, path::Path};

const DIRECTORY: u64 = 0x0010;
const OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const REPARSE_POINT: u64 = 0x0400;

pub(super) fn single(path: &Path) -> io::Result<bool> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(path)?;
    let info = winapi_util::file::information(&file)?;
    Ok(is_single_regular_handle(&info))
}

fn is_single_regular_handle(info: &winapi_util::file::Information) -> bool {
    info.number_of_links() == 1 && info.file_attributes() & (DIRECTORY | REPARSE_POINT) == 0
}
