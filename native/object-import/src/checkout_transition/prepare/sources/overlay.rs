#[cfg(test)]
mod tests;

use super::{MAX_BYTES, invalid, wire};
use crate::command_import::Overlay;
use std::{io, path::Path};

pub(super) fn verify(
    directory: &Path,
    version: &wire::Version,
    compressed: &mut usize,
    overlay: Option<&Overlay>,
) -> io::Result<()> {
    crate::merge_history::hash(&version.hash)?;
    let proof = version.proof_files.as_deref().unwrap_or(&version.files);
    if version.proof_files.is_some()
        && version.files
            .iter()
            .any(|file| {
                !proof
                    .iter()
                    .any(|source| {
                        source.relative_path.trim() == file.relative_path.trim()
                            && source.hash.trim() == file.hash.trim()
                            && source.name == file.name
                            && source.test == file.test
                    })
            })
    {
        return Err(invalid("checkout selected manifest differs from proof"));
    }
    let expected = serde_json::to_value(proof).map_err(io::Error::other)?;
    if let Some(overlay) = overlay
        && let Some(value) = overlay.read(&version.hash, "Version")?
    {
        charge(overlay, &version.hash, compressed)?;
        return crate::checkout::plan::verify_manifest_value(value, &expected);
    }
    crate::checkout::plan::verify_manifest(directory, &version.hash, &expected, compressed)
}

pub(super) fn files(
    directory: &Path,
    manifests: &[wire::Manifest],
    total: &mut usize,
    compressed: &mut usize,
    overlay: Option<&Overlay>,
) -> io::Result<Vec<Vec<u8>>> {
    let Some(overlay) = overlay else {
        return super::load_files(directory, manifests, total, compressed);
    };
    let local: Vec<_> = manifests
        .iter()
        .filter(|file| overlay.source(file.hash.trim()).is_none())
        .cloned()
        .collect();
    let mut imported = Vec::with_capacity(manifests.len());
    for file in manifests {
        let trimmed_hash = file.hash.trim();
        imported.push(if overlay.source(trimmed_hash).is_some() {
            Some(body(directory, trimmed_hash, total, compressed, Some(overlay))?)
        } else {
            None
        });
    }
    // Keep indexed parallel repository reads for the non-imported portion.
    let mut local = super::load_files(directory, &local, total, compressed)?.into_iter();
    imported
        .into_iter()
        .map(|body| {
            body.or_else(|| local.next()).ok_or_else(|| invalid("checkout overlay Source order"))
        })
        .collect()
}

pub(in crate::checkout_transition::prepare) fn body(
    directory: &Path,
    hash: &str,
    total: &mut usize,
    compressed: &mut usize,
    overlay: Option<&Overlay>,
) -> io::Result<Vec<u8>> {
    let identity = crate::merge_history::hash(hash)?;
    let remaining =
        MAX_BYTES.checked_sub(*total).ok_or_else(|| invalid("checkout overlay raw limit"))?;
    let bytes = if let Some(overlay) = overlay
        && let Some(bytes) = overlay.source(hash)
    {
        if bytes.len() > remaining {
            return Err(invalid("checkout overlay raw limit"));
        }
        charge(overlay, hash, compressed)?;
        overlay.trace_source(hash)?;
        bytes.to_vec()
    } else {
        crate::checkout::repository::source(directory, identity, remaining, compressed)?
    };
    *total += bytes.len();
    Ok(bytes)
}

fn charge(overlay: &Overlay, hash: &str, compressed: &mut usize) -> io::Result<()> {
    let bytes =
        overlay.compressed(hash).ok_or_else(|| invalid("checkout overlay compressed object"))?;
    let next = compressed
        .checked_add(bytes.len())
        .filter(|count| *count <= MAX_BYTES)
        .ok_or_else(|| invalid("checkout overlay compressed limit"))?;
    *compressed = next;
    Ok(())
}
