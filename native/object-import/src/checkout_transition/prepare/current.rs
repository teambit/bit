use super::super::{invalid, wire};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs,
    io::{self, Read},
};
pub(super) struct Loaded {
    pub(super) raw: Vec<u8>,
    pub(super) normalized: Vec<u8>,
}
pub(super) fn load(files: &[wire::Current], total: &mut usize) -> io::Result<Vec<Loaded>> {
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for file in files {
        crate::checkout::plan::relative_path(&file.relative_path)?;
        if file.bitmap && file.relative_path != ".bitmap" {
            return Err(invalid("checkout bitmap normalization label"));
        }
        if !file.path.is_absolute()
            || file.relative_path.len() > 32768
            || file.relative_path.contains('\0')
            || !seen.insert(&file.relative_path)
            || !fs::symlink_metadata(&file.path)?.is_file()
        {
            return Err(invalid("checkout current path/type"));
        }
        let loaded = read(file, total)?;
        output.push(loaded);
    }
    Ok(output)
}
fn read(file: &wire::Current, total: &mut usize) -> io::Result<Loaded> {
    crate::merge_history::hash(&file.raw_hash)?;
    crate::merge_history::hash(&file.snapshot_hash)?;
    let maximum = 32 * 1024 * 1024 - *total;
    let input = fs::File::open(&file.path)?;
    if input.metadata()?.len() > maximum as u64 {
        return Err(invalid("checkout current byte limit"));
    }
    let mut raw = Vec::new();
    input
        .take((maximum + 1) as u64)
        .read_to_end(&mut raw)?;
    if raw.len() > maximum || digest(&raw) != file.raw_hash {
        return Err(invalid("checkout current disk snapshot differs"));
    }
    *total += raw.len();
    if raw.starts_with(b"\xef\xbb\xbf") {
        raw.drain(..3);
    }
    if file.bitmap {
        raw = crate::inspection::normalize_bitmap(&raw)?;
    }
    if digest(&raw) != file.snapshot_hash {
        return Err(invalid("checkout canonical snapshot differs"));
    }
    let normalized = crate::checkout::eol::normalize(raw.clone(), false);
    Ok(Loaded { raw, normalized })
}
fn digest(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
