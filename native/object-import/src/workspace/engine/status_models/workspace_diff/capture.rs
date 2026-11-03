//! Capture workspace source [`File`] items via [`all`] for [`Request`] status diff comparisons.

use super::{Request, comparison, invalid};
use crate::workspace::engine::read;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

/// Captured workspace source file metadata, raw bytes, and byte-budget cost.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct File {
    pub(super) metadata: Value,
    pub(super) contents: Vec<u8>,
    pub(super) cost: usize,
}

/// Captures and normalizes all workspace source [`File`] items across `request` ([`Request`]) targets in parallel via [`one`] and [`group_target_files`].
pub(super) fn all(request: &Request, pool: &rayon::ThreadPool) -> io::Result<Vec<Vec<File>>> {
    super::super::super::count(request.targets.len())?;
    let total_files: usize = request.targets
        .iter()
        .map(|target| target.files.len())
        .sum();
    let mut paths = Vec::with_capacity(total_files);
    let mut bitmaps = HashSet::new();
    let mut identities = HashSet::with_capacity(request.targets.len());
    for target in &request.targets {
        comparison::capture::validate(target)?;
        if target.identity.trim().is_empty() || !identities.insert(target.identity.trim()) {
            return Err(invalid("workspace diff duplicate component"));
        }
        for file in &target.files {
            let source = comparison::capture::source_path(&request.root, target, file)?;
            if target.directory == "." && file == ".bitmap" {
                bitmaps.insert(source.clone());
            }
            paths.push(source);
        }
    }
    let captured =
        read::read_with(&paths, pool, |path, bytes| one(path, bytes, bitmaps.contains(path)))?
            .into_iter()
            .collect::<io::Result<Vec<_>>>()?;
    group_target_files(request, captured)
}

/// Groups flat `captured` [`File`] entries back into per-target vectors matching `request.targets`.
/// Rejects trailing unconsumed entries when `captured` does not match the total file count.
#[inline]
fn group_target_files(request: &Request, captured: Vec<File>) -> io::Result<Vec<Vec<File>>> {
    let mut captured = captured.into_iter();
    let grouped = request.targets
        .iter()
        .map(|target| {
            target.files
                .iter()
                .map(|file| {
                    let mut item =
                        captured.next().ok_or_else(|| invalid("workspace diff captured file"))?;
                    item.metadata["relativePath"] = json!(file);
                    item.metadata["name"] = json!(file.rsplit('/').next().unwrap_or(file));
                    Ok(item)
                })
                .collect::<io::Result<Vec<_>>>()
        })
        .collect::<io::Result<Vec<_>>>()?;
    if captured.next().is_some() {
        return Err(invalid("workspace diff captured file count"));
    }
    Ok(grouped)
}

/// Normalizes `bytes` (stripping BOM and normalizing `.bitmap` when `bitmap` is set) into a [`File`].
#[inline]
fn one(path: &Path, bytes: Vec<u8>, bitmap: bool) -> io::Result<File> {
    let original = bytes.len();
    let bytes =
        if bitmap { crate::inspection::normalize_bitmap(&read::strip_bom(bytes))? } else { bytes };
    let (metadata, contents) = read::canonical(path, bytes);
    Ok(File {
        metadata: json!({"test":false,"file":metadata.linux_hash}),
        contents,
        cost: metadata.raw_bytes.max(original),
    })
}
