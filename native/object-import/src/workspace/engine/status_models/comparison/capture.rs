//! Source file capture via [`all`] and [`overlay`] normalization for [`Target`] comparisons.

mod overlay;

use super::{Request, Target, invalid};
use crate::workspace::engine::read;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
};

/// Reads and normalizes all workspace and overlay source files across `request.targets` ([`Target`]) via [`collect_sources`] and [`capture`].
pub(super) fn all(request: &Request, pool: &rayon::ThreadPool) -> io::Result<Vec<Value>> {
    let (paths, bitmaps) = collect_sources(request)?;
    let captured =
        read::read_with(&paths, pool, |path, bytes| capture(path, bytes, bitmaps.contains(path)))?
            .into_iter()
            .collect::<io::Result<Vec<_>>>()?;
    if captured
        .iter()
        .map(|file| file.raw_bytes)
        .try_fold(0_usize, usize::checked_add)
        .is_none_or(|total| total > super::super::super::MAX_RAW)
    {
        return Err(invalid("status normalized source budget"));
    }
    let mut captured = captured.into_iter();
    let output = request.targets
        .iter()
        .map(|target| build_target_files(target, &mut captured))
        .collect::<Vec<_>>();
    if captured.next().is_some() {
        return Err(invalid("status normalized source budget"));
    }
    Ok(output)
}

/// Collects all source file paths and `.bitmap` paths across `request.targets`.
fn collect_sources(request: &Request) -> io::Result<(Vec<PathBuf>, HashSet<PathBuf>)> {
    if request.targets.len() > 4096 {
        return Err(invalid("status comparison target count"));
    }
    let total_files = request.targets
        .iter()
        .map(|target| target.files.len())
        .sum();
    let mut paths = Vec::with_capacity(total_files);
    let mut bitmaps = HashSet::new();
    let mut identities = HashSet::with_capacity(request.targets.len());
    for target in &request.targets {
        validate(target)?;
        if target.identity.trim().is_empty() || !identities.insert(target.identity.trim()) {
            return Err(invalid("status comparison duplicate identity"));
        }
        append_target_sources(&request.root, target, &mut paths, &mut bitmaps)?;
    }
    Ok((paths, bitmaps))
}

/// Appends validated source paths for `target` into `paths` and records root `.bitmap` files in `bitmaps`.
#[inline]
fn append_target_sources(
    root: &Path,
    target: &Target,
    paths: &mut Vec<PathBuf>,
    bitmaps: &mut HashSet<PathBuf>,
) -> io::Result<()> {
    for file in &target.files {
        let source = source_path(root, target, file)?;
        if target.directory == "." && file == ".bitmap" {
            bitmaps.insert(source.clone());
        }
        paths.push(source);
    }
    Ok(())
}
/// Builds the serialized `files` JSON array for `target` from `captured` metadata records.
#[inline]
fn build_target_files(
    target: &Target,
    captured: &mut impl Iterator<Item = read::Metadata>,
) -> Value {
    Value::Array(
        target
            .files
            .iter()
            .filter_map(|file| {
                let metadata = captured.next()?;
                Some(json!({"relativePath":file,"name":file.rsplit('/').next().unwrap_or(file),"test":false,"file":metadata.linux_hash}))
            })
            .collect(),
    )
}
/// Normalizes `bytes` (including root `.bitmap` canonicalization) and computes [`read::Metadata`] for `path`.
#[inline]
fn capture(path: &Path, bytes: Vec<u8>, bitmap: bool) -> io::Result<read::Metadata> {
    let original = bytes.len();
    let bytes =
        if bitmap { crate::inspection::normalize_bitmap(&read::strip_bom(bytes))? } else { bytes };
    let mut metadata = read::canonical(path, bytes).0;
    metadata.raw_bytes = metadata.raw_bytes.max(original);
    Ok(metadata)
}

pub(in crate::workspace::engine) fn validate(target: &Target) -> io::Result<()> {
    if target.directory != "." {
        relative(&target.directory)?;
    }
    let mut seen = HashSet::with_capacity(target.files.len());
    for file in &target.files {
        relative(file)?;
        if !seen.insert(file) {
            return Err(invalid("status comparison duplicate file"));
        }
    }
    overlay::validate(target)?;
    let fields =
        target.current.as_object().ok_or_else(|| invalid("status comparison current fields"))?;
    if fields
        .keys()
        .any(|field| {
            !matches!(
                field.as_str(),
                "mainFile"
                    | "dependencies"
                    | "devDependencies"
                    | "packageDependencies"
                    | "devPackageDependencies"
                    | "peerPackageDependencies"
                    | "bindingPrefix"
                    | "overrides"
                    | "extensions",
            )
        })
    {
        return Err(invalid("status comparison unknown current field"));
    }
    relative(
        fields
            .get("mainFile")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("status comparison main file"))?,
    )
}
#[inline]
fn relative(value: &str) -> io::Result<()> {
    if value.is_empty()
        || value.trim() != value
        || value.len() > 32768
        || value
            .chars()
            .any(|ch| matches!(ch, '\\' | ':') || ch.is_control())
        || value
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid("status comparison relative path"));
    }
    Ok(())
}

/// Read mutated callback contents from Rust-owned temporary files, retaining logical inventory paths.
#[inline]
pub(in crate::workspace::engine) fn source_path(
    root: &Path,
    target: &Target,
    file: &str,
) -> io::Result<std::path::PathBuf> {
    overlay::source_path(root, target, file)
}
