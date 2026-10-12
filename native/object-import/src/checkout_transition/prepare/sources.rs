use super::super::{invalid, wire};
use std::{io, path::Path};
pub(super) fn load(
    directory: &Path,
    version: &wire::Version,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Vec<u8>>> {
    crate::checkout::plan::verify_manifest(
        directory,
        &version.hash,
        &serde_json::to_value(&version.files).map_err(io::Error::other)?,
        compressed,
    )?;
    let mut files = Vec::new();
    for file in &version.files {
        let body = crate::checkout::repository::source(
            directory,
            crate::merge_history::hash(&file.hash)?,
            32 * 1024 * 1024 - *total,
            compressed,
        )?;
        *total += body.len();
        if *total > 32 * 1024 * 1024 {
            return Err(invalid("checkout prepared raw limit"));
        }
        files.push(body);
    }
    Ok(files)
}
