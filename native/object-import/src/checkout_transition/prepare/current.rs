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
pub(super) fn load(
    files: &[wire::Current],
    directory: &std::path::Path,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Loaded>> {
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for file in files {
        validate(file, &mut seen)?;
        let loaded = if let Some(hash) = &file.source_hash {
            read_source(file, directory, hash, total, compressed)?
        } else {
            read(file, total)?
        };
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

fn read_source(
    file: &wire::Current,
    directory: &std::path::Path,
    hash: &str,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Loaded> {
    if file.bitmap || file.raw_hash != hash || file.snapshot_hash != hash {
        return Err(invalid("checkout current Source snapshot identity"));
    }
    let raw = crate::checkout::repository::source(
        directory,
        crate::merge_history::hash(hash)?,
        32 * 1024 * 1024 - *total,
        compressed,
    )?;
    *total += raw.len();
    let normalized = crate::checkout::eol::normalize(raw.clone(), false);
    Ok(Loaded { raw, normalized })
}

fn validate<'a>(file: &'a wire::Current, seen: &mut HashSet<&'a str>) -> io::Result<()> {
    crate::checkout::plan::relative_path(&file.relative_path)?;
    if file.bitmap && file.relative_path != ".bitmap" {
        return Err(invalid("checkout bitmap normalization label"));
    }
    if !file.path.is_absolute()
        || file.relative_path.len() > 32768
        || file.relative_path.contains('\0')
        || !seen.insert(file.relative_path.as_str())
        || (file.source_hash.is_none() && !fs::symlink_metadata(&file.path)?.is_file())
    {
        return Err(invalid("checkout current path/type"));
    }
    Ok(())
}
