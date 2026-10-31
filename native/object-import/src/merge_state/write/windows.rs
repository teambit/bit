//! Keep an original handle open while checking Windows file identity before truncation.
use super::invalid;
use std::{
    fs::{self, OpenOptions},
    io,
    os::windows::fs::OpenOptionsExt,
    path::Path,
};

// Open the reparse point itself rather than following a substituted symlink or junction.
const OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const REPARSE_POINT: u64 = 0x0400;

pub(super) fn open(path: &Path) -> io::Result<fs::File> {
    let original = OpenOptions::new()
        .read(true)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(path)?;
    let before = winapi_util::file::information(&original)?;
    validate(&before)?;
    let file = OpenOptions::new()
        .write(true)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(path)?;
    let after = winapi_util::file::information(&file)?;
    validate(&after)?;
    if !same_file_identity(&before, &after) {
        return Err(invalid("merge state file changed"));
    }
    Ok(file)
}

fn same_file_identity(
    before: &winapi_util::file::Information,
    after: &winapi_util::file::Information,
) -> bool {
    before.volume_serial_number() == after.volume_serial_number()
        && before.file_index() == after.file_index()
}

fn validate(info: &winapi_util::file::Information) -> io::Result<()> {
    if info.number_of_links() != 1 || info.file_attributes() & REPARSE_POINT != 0 {
        return Err(invalid("unsupported merge state file"));
    }
    Ok(())
}
