//! Select the `Version` refs via [`select_versions`] for staged, [`repeat`], and [`all_versions`] exports.

use super::{Prepare, all_versions, invalid, repeat};
use serde_json::Value;
use std::{io, path::Path};

/// Selects [`Staged`] version hashes and labels for `model` according to `input.options`.
pub(super) fn select_versions(
    input: &Prepare,
    model: &Value,
    objects_dir: &Path,
) -> io::Result<Staged> {
    if input.options.head_only {
        head_only(model)
    } else if input.options.all || input.options.all_versions {
        all_versions::select(model, objects_dir)
    } else if has_staged(model) {
        staged(model)
    } else {
        repeat::select(model)
    }
}

/// Selects only the current `model["head"]` version and its unambiguous tag label for `--head-only` exports.
fn head_only(model: &Value) -> io::Result<Staged> {
    let head = model["head"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("outbound head-only head"))?;
    crate::merge_history::hash(head)?;
    let labels = model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(|versions| versions.iter())
        .filter(|(_, hash)| hash.as_str().map(str::trim) == Some(head))
        .map(|(tag, _)| tag.trim())
        .collect::<Vec<_>>();
    let version = match labels.as_slice() {
        [] => head,
        [version] => *version,
        _ => return Err(invalid("outbound ambiguous head-only tags")),
    };
    validate_label(version)?;
    Ok(Staged {
        head: head.to_owned(),
        hashes: vec![head.to_owned()],
        labels: vec![version.to_owned()],
    })
}

#[inline]
fn validate_label(label: &str) -> io::Result<()> {
    let trimmed = label.trim();
    if trimmed.is_empty()
        || matches!(trimmed, "." | "..")
        || trimmed.contains(['@', '/', '\\'])
        || trimmed.chars().any(char::is_control)
    {
        return Err(invalid("outbound empty Version label"));
    }
    Ok(())
}

#[inline]
pub(super) fn has_staged(model: &Value) -> bool {
    model["state"]["versions"]
        .as_object()
        .is_some_and(|rows| {
            rows.values()
                .any(|row| row["local"] == true)
        })
}
/// The local versions of a staged model: the head's version name, the head,
/// and every local Version (the head among them).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Staged {
    pub(super) head: String,
    pub(super) hashes: Vec<String>,
    pub(super) labels: Vec<String>,
}

pub(super) fn staged(model: &Value) -> io::Result<Staged> {
    let rows =
        model["state"]["versions"].as_object().ok_or_else(|| invalid("outbound local versions"))?;
    let head = model["head"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("outbound non-head local Version"))?;
    crate::merge_history::hash(head)?;
    let mut has_head = false;
    let mut hashes = Vec::with_capacity(rows.len());
    let mut labels = Vec::with_capacity(rows.len());
    for (key, _) in rows
        .iter()
        .filter(|(_, row)| row["local"] == true)
    {
        let key = key.trim();
        validate_label(key)?;
        // A tag names its Version through `versions`; a snap is its own hash.
        let hash = match model["versions"][key]
            .as_str()
            .or_else(|| model["orphanedVersions"][key].as_str())
            .map(str::trim)
        {
            Some(hash) => hash,
            None if crate::merge_history::hash(key).is_ok() => key,
            None => return Err(invalid("outbound local Version ref")),
        };
        crate::merge_history::hash(hash)?;
        has_head |= hash == head;
        if !hashes.iter().any(|known| known == hash) {
            hashes.push(hash.to_owned());
        }
        labels.push(key.to_owned());
    }
    if !has_head {
        return Err(invalid("outbound non-head local Version"));
    }
    Ok(Staged { head: head.to_owned(), hashes, labels })
}
