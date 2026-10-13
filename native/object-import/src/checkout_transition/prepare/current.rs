use super::super::{invalid, wire};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs,
    io::{self, Read},
};
mod parallel;
#[cfg(test)]
mod tests;
pub(super) struct Loaded {
    pub(super) raw: Vec<u8>,
    pub(super) normalized: Vec<u8>,
}
pub(super) fn load(
    files: &[wire::Current],
    directory: &std::path::Path,
    total: &mut usize,
    compressed: &mut usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
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
    let length = input.metadata()?.len();
    if length > maximum as u64 {
        return Err(invalid("checkout current byte limit"));
    }
    let mut raw = Vec::with_capacity(length as usize);
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

fn validate<'a>(
    file: &'a wire::Current,
    seen: &mut HashSet<&'a str>,
    retained: bool,
) -> io::Result<()> {
    crate::checkout::plan::relative_path(&file.relative_path)?;
    if file.bitmap && file.relative_path != ".bitmap" {
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
    let snapshot = snapshots
        .and_then(|state| state.get(token, &file.path, &file.raw_hash))
        .filter(|snapshot| {
            file.source_hash.is_none() && snapshot.raw_bytes <= 32 * 1024 * 1024 - *total
        })
        .ok_or_else(|| invalid("checkout retained workspace observation"))?;
    let raw = if file.bitmap {
        let bytes = crate::inspection::normalize_bitmap(&snapshot.contents)?;
        if digest(&bytes) != file.snapshot_hash {
            return Err(invalid("checkout retained bitmap identity"));
        }
        bytes
    } else {
        if snapshot.snapshot_hash != file.snapshot_hash {
            return Err(invalid("checkout retained workspace identity"));
        }
        snapshot.contents.to_vec()
    };
    *total += snapshot.raw_bytes;
    let normalized = crate::checkout::eol::normalize(raw.clone(), false);
    Ok(Loaded { raw, normalized })
}
