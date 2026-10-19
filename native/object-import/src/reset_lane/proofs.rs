//! Retain graph bodies and mutable selection inputs until publication revalidation.
use super::{Repository, invalid, object_path};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub(super) type ReadSet = Vec<(PathBuf, Option<Vec<u8>>)>;

pub(super) fn read(path: &Path, proofs: &mut ReadSet) -> io::Result<Option<Vec<u8>>> {
    let bytes = regular(path)?;
    retain(path, bytes.as_deref(), proofs)?;
    Ok(bytes)
}

fn regular(path: &Path) -> io::Result<Option<Vec<u8>>> {
    let bytes = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() => Some(fs::read(path)?),
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

pub(super) fn object(
    objects: &Path,
    hash: &str,
    kind: &str,
    proofs: &mut ReadSet,
) -> io::Result<serde_json::Value> {
    crate::merge_history::hash(hash)?;
    let path = object_path(objects, hash);
    let before = read(&path, proofs)?;
    let value = super::outbound::read_object(objects, hash, kind)?;
    if read(&path, &mut Vec::new())? != before {
        return Err(invalid("lane reset object changed during capture"));
    }
    Ok(value)
}

pub(super) fn verify(proofs: &ReadSet) -> io::Result<()> {
    for (path, expected) in proofs {
        if read(path, &mut Vec::new())? != *expected {
            return Err(invalid("lane reset retained input changed"));
        }
    }
    Ok(())
}

pub(super) fn capture(repository: &Repository) -> io::Result<ReadSet> {
    let mut heads = vec![repository.heads.current.clone()];
    heads.extend(repository.heads.baseline.iter().cloned());
    if repository.model["detachedHeads"]["heads"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty())
    {
        heads.extend(repository.model["head"].as_str().map(str::to_owned));
    }
    capture_heads(repository, &heads)
}

pub(super) fn capture_heads(repository: &Repository, heads: &[String]) -> io::Result<ReadSet> {
    let records = super::history::records(repository, heads)?;
    let mut seen = HashSet::new();
    let mut proofs = repository.reads.clone();
    let mut bytes = 0;
    for row in records.as_array().ok_or_else(|| invalid("lane reset graph proofs"))? {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("lane reset graph proof hash"))?;
        if !seen.insert(hash.to_owned()) {
            return Err(invalid("lane reset duplicate graph proof"));
        }
        if seen.len() > 4096 {
            return Err(invalid("lane reset graph proof limit"));
        }
        crate::merge_history::hash(hash)?;
        let raw = match fs::read(object_path(&repository.objects, hash)) {
            Ok(raw) => Some(raw),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        bytes += raw.as_ref().map_or(0, Vec::len);
        if bytes > 96 * 1024 * 1024 {
            return Err(invalid("lane reset graph proof byte limit"));
        }
        proofs.push((object_path(&repository.objects, hash), raw));
    }
    Ok(proofs)
}
