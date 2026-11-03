//! Version manifest verification ([`verify`]) and `Source` resolution against in-memory import [`Overlay`]s.

#[cfg(test)]
mod tests;

use super::{MAX_BYTES, invalid, wire};
use crate::command_import::Overlay;
use std::{io, path::Path};

/// Verify [`wire::Version`] against `directory` or [`Overlay`] and validate its file manifest.
pub(super) fn verify(
    directory: &Path,
    version: &wire::Version,
    compressed: &mut usize,
    overlay: Option<&Overlay>,
) -> io::Result<()> {
    let version_hash = version.hash.trim();
    crate::merge_history::hash(version_hash)?;
    let proof = version.proof_files.as_deref().unwrap_or(&version.files);
    if version.proof_files.is_some() {
        let by_path: std::collections::HashMap<&str, _> = proof
            .iter()
            .map(|source| (source.relative_path.trim(), source))
            .collect();
        if version.files
            .iter()
            .any(|file| {
                by_path
                    .get(file.relative_path.trim())
                    .is_none_or(|source| {
                        source.hash.trim() != file.hash.trim()
                            || source.name != file.name
                            || source.test != file.test
                    })
            })
        {
            return Err(invalid("checkout selected manifest differs from proof"));
        }
    }
    let expected = serde_json::to_value(proof).map_err(io::Error::other)?;
    if let Some(overlay) = overlay
        && let Some(value) = overlay.read(version_hash, "Version")?
    {
        charge(overlay, version_hash, compressed)?;
        return crate::checkout::plan::verify_manifest_value(value, &expected);
    }
    crate::checkout::plan::verify_manifest(directory, version_hash, &expected, compressed)
}

/// Load raw `Source` file bodies for [`wire::Manifest`] entries, reading imported blobs from [`Overlay`] via [`body`] when present.
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

/// Load a single `Source` body by `hash` from [`Overlay`] `overlay` or `directory` within [`MAX_BYTES`] budgets.
#[inline]
pub(in crate::checkout_transition::prepare) fn body(
    directory: &Path,
    hash: &str,
    total: &mut usize,
    compressed: &mut usize,
    overlay: Option<&Overlay>,
) -> io::Result<Vec<u8>> {
    let hash = hash.trim();
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
    *total = total.saturating_add(bytes.len());
    Ok(bytes)
}

#[inline]
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
