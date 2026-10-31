mod parallel;
#[cfg(test)]
mod tests;

use super::super::{invalid, wire};
use crate::read_budget::Budget;
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
pub(super) fn load_with_overlay(
    files: &[wire::Current],
    directory: &std::path::Path,
    total: &mut usize,
    compressed: &mut usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Loaded>> {
    let mut seen = HashSet::new();
    if files.len() >= 32
        && files
            .iter()
            .all(|file| file.source_hash.is_none() && file.read_token.is_none())
        && rayon::current_thread_index().is_some()
        && rayon::current_num_threads() > 1
    {
        for file in files {
            validate(file, &mut seen, false)?;
        }
        return parallel::load(files, total);
    }
    let mut output = Vec::new();
    for file in files {
        validate(file, &mut seen, file.read_token.is_some())?;
        let loaded = if let Some(token) = file.read_token {
            retained(file, token, snapshots, total)?
        } else if let Some(hash) = &file.source_hash {
            read_source(file, directory, hash, total, compressed, overlay)?
        } else {
            read(file, total)?
        };
        output.push(loaded);
    }
    Ok(output)
}
fn read(file: &wire::Current, total: &mut usize) -> io::Result<Loaded> {
    let raw_hash = file.raw_hash.trim();
    let snapshot_hash = file.snapshot_hash.trim();
    crate::merge_history::hash(raw_hash)?;
    crate::merge_history::hash(snapshot_hash)?;
    let maximum = (32 * 1024 * 1024usize).saturating_sub(*total);
    let input = fs::File::open(&file.path)?;
    let length = input.metadata()?.len();
    if length > maximum as u64 {
        return Err(invalid("checkout current byte limit"));
    }
    let mut raw = Vec::with_capacity(length as usize);
    input
        .take((maximum + 1) as u64)
        .read_to_end(&mut raw)?;
    if raw.len() > maximum || digest(&raw) != raw_hash {
        return Err(invalid("checkout current disk snapshot differs"));
    }
    *total += raw.len();
    canonical(file, raw)
}

fn read_shared(file: &wire::Current, budget: &Budget) -> io::Result<(Loaded, usize)> {
    let raw_hash = file.raw_hash.trim();
    crate::merge_history::hash(raw_hash)?;
    crate::merge_history::hash(file.snapshot_hash.trim())?;
    let raw = budget.read(fs::File::open(&file.path)?)?;
    if digest(&raw) != raw_hash {
        return Err(invalid("checkout current disk snapshot differs"));
    }
    let length = raw.len();
    canonical(file, raw).map(|loaded| (loaded, length))
}

fn canonical(file: &wire::Current, mut raw: Vec<u8>) -> io::Result<Loaded> {
    if raw.starts_with(b"\xef\xbb\xbf") {
        raw.drain(..3);
    }
    if file.bitmap {
        raw = crate::inspection::normalize_bitmap(&raw)?;
    }
    if digest(&raw) != file.snapshot_hash.trim() {
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
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Loaded> {
    let hash = hash.trim();
    if file.bitmap || file.raw_hash.trim() != hash || file.snapshot_hash.trim() != hash {
        return Err(invalid("checkout current Source snapshot identity"));
    }
    let raw = super::sources::body(directory, hash, total, compressed, overlay)?;
    let normalized = crate::checkout::eol::normalize(raw.clone(), false);
    Ok(Loaded { raw, normalized })
}

fn validate<'a>(
    file: &'a wire::Current,
    seen: &mut HashSet<&'a str>,
    retained: bool,
) -> io::Result<()> {
    crate::checkout::plan::relative_path(&file.relative_path)?;
    if file.bitmap && file.relative_path.trim() != ".bitmap" {
        return Err(invalid("checkout bitmap normalization label"));
    }
    if !file.path.is_absolute()
        || file.relative_path.len() > 32768
        || file.relative_path.contains('\0')
        || !seen.insert(file.relative_path.as_str())
    {
        return Err(invalid("checkout current path/type"));
    }
    if !retained && file.source_hash.is_none() && !fs::symlink_metadata(&file.path)?.is_file() {
        return Err(invalid("checkout current path/type"));
    }
    Ok(())
}

fn retained(
    file: &wire::Current,
    token: u64,
    snapshots: Option<&crate::workspace::snapshots::State>,
    total: &mut usize,
) -> io::Result<Loaded> {
    let raw_hash = file.raw_hash.trim();
    let snapshot_hash = file.snapshot_hash.trim();
    let maximum = (32 * 1024 * 1024usize).saturating_sub(*total);
    let snapshot = snapshots
        .and_then(|state| state.get(token, &file.path, raw_hash))
        .filter(|snapshot| file.source_hash.is_none() && snapshot.raw_bytes <= maximum)
        .ok_or_else(|| invalid("checkout retained workspace observation"))?;
    let raw = if file.bitmap {
        let bytes = crate::inspection::normalize_bitmap(&snapshot.contents)?;
        if digest(&bytes) != snapshot_hash {
            return Err(invalid("checkout retained bitmap identity"));
        }
        bytes
    } else {
        if snapshot.snapshot_hash.trim() != snapshot_hash {
            return Err(invalid("checkout retained workspace identity"));
        }
        snapshot.contents.to_vec()
    };
    *total += snapshot.raw_bytes;
    let normalized = crate::checkout::eol::normalize(raw.clone(), false);
    Ok(Loaded { raw, normalized })
}
