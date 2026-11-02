//! Retain graph bodies and mutable selection preimages ([`ReadSet`], [`read`]) until publication revalidation.
use super::{Repository, invalid, object_path};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

/// Ordered list of `(path, preimage_bytes)` pairs retained for lane-reset revalidation.
pub(super) type ReadSet = Vec<(PathBuf, Option<Vec<u8>>)>;

/// Reads regular file `path` and appends its preimage bytes to `proofs`.
#[inline]
pub(super) fn read(path: &Path, proofs: &mut ReadSet) -> io::Result<Option<Vec<u8>>> {
    let bytes = regular(path)?;
    retain(path, bytes.as_deref(), proofs)?;
    Ok(bytes)
}

/// Reads an ordinary regular file at `path` (up to 96 MiB), returning `None` when absent.
fn regular(path: &Path) -> io::Result<Option<Vec<u8>>> {
    let bytes = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            Some(fs::read(path)?)
        }
        Ok(_) => return Err(invalid("lane reset nonordinary input")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    if bytes
        .as_ref()
        .is_some_and(|bytes| bytes.len() > 96 * 1024 * 1024)
    {
        return Err(invalid("lane reset input byte limit"));
    }
    Ok(bytes)
}

/// Appends `(path, bytes)` to `proofs` or verifies that a previously recorded path is unchanged.
fn retain(path: &Path, bytes: Option<&[u8]>, proofs: &mut ReadSet) -> io::Result<()> {
    if let Some((_, previous)) = proofs
        .iter()
        .find(|(previous, _)| previous == path)
    {
        if previous.as_deref() != bytes {
            return Err(invalid("lane reset retained input changed"));
        }
    } else {
        let retained = proofs
            .iter()
            .map(|(_, bytes)| bytes.as_ref().map_or(0, Vec::len))
            .sum::<usize>();
        if proofs.len() >= 32768
            || retained.saturating_add(bytes.map_or(0, <[u8]>::len)) > 96 * 1024 * 1024
        {
            return Err(invalid("lane reset retained input limit"));
        }
        proofs.push((path.to_owned(), bytes.map(<[u8]>::to_vec)));
    }
    Ok(())
}

/// Reads and decodes loose object `hash` of `kind` in `objects`, recording its preimage in `proofs`.
pub(super) fn object(
    objects: &Path,
    hash: &str,
    kind: &str,
    proofs: &mut ReadSet,
) -> io::Result<serde_json::Value> {
    let hash = crate::validate::hexadecimal(&crate::merge_history::hash(hash.trim())?);
    let path = object_path(objects, &hash);
    let before = read(&path, proofs)?;
    let value = super::outbound::read_object(objects, &hash, kind)?;
    if regular(&path)? != before {
        return Err(invalid("lane reset object changed during capture"));
    }
    Ok(value)
}

/// Revalidates that every file in `proofs` still matches its recorded preimage bytes.
pub(super) fn verify(proofs: &ReadSet) -> io::Result<()> {
    for (path, expected) in proofs {
        if regular(path)? != *expected {
            return Err(invalid("lane reset retained input changed"));
        }
    }
    Ok(())
}

/// Captures read proofs for all reachable `Version` ancestors of `repository`'s active heads.
pub(super) fn capture(repository: &Repository) -> io::Result<ReadSet> {
    let mut heads = vec![repository.heads.current.clone()];
    heads.extend(repository.heads.baseline.iter().cloned());
    if repository.model["detachedHeads"]["heads"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty())
    {
        heads.extend(
            repository.model["head"]
                .as_str()
                .map(str::trim)
                .filter(|head| !head.is_empty())
                .map(str::to_owned),
        );
    }
    capture_heads(repository, &heads)
}

pub(super) fn capture_heads(repository: &Repository, heads: &[String]) -> io::Result<ReadSet> {
    let records = super::history::records(repository, heads)?;
    let rows = records.as_array().ok_or_else(|| invalid("lane reset graph proofs"))?;
    let mut seen = HashSet::with_capacity(rows.len());
    let mut proofs = repository.reads.clone();
    for row in rows {
        let raw_hash = row["hash"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("lane reset graph proof hash"))?;
        let hash = crate::validate::hexadecimal(&crate::merge_history::hash(raw_hash)?);
        if !seen.insert(hash.clone()) {
            return Err(invalid("lane reset duplicate graph proof"));
        }
        if seen.len() > 4096 {
            return Err(invalid("lane reset graph proof limit"));
        }
        let path = object_path(&repository.objects, &hash);
        let raw = regular(&path)?;
        retain(&path, raw.as_deref(), &mut proofs)?;
    }
    Ok(proofs)
}
