//! [`select`] the complete local `Version` ancestry into [`Staged`] for `ExportCmd --all-versions`.

use super::{Staged, history::parents, invalid};
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

/// Collects all reachable ancestor `Version` hashes and version tags from `model` into [`Staged`].
#[inline]
pub(super) fn select(model: &Value, dir: &Path) -> io::Result<Staged> {
    let head = model["head"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("outbound all-versions head"))?;
    crate::merge_history::hash(head)?;
    let tags =
        model["versions"].as_object().ok_or_else(|| invalid("outbound all-versions tags"))?;
    let orphaned = match model.get("orphanedVersions") {
        None | Some(Value::Null) => None,
        Some(Value::Object(map)) => Some(map),
        Some(_) => return Err(invalid("outbound all-versions orphaned tags")),
    };
    let mut pending = vec![head.to_owned()];
    let mut seen = HashSet::new();
    let mut hashes = Vec::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) {
            continue;
        }
        if seen.len() > 4096 {
            return Err(invalid("outbound all-versions history budget"));
        }
        let ancestors = parents(dir, &hash)?;
        let ancestors =
            ancestors.as_array().ok_or_else(|| invalid("outbound all-versions parents"))?;
        pending.extend(
            ancestors
                .iter()
                .rev()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|ancestor| !ancestor.is_empty())
                .map(str::to_owned),
        );
        hashes.push(hash);
    }
    let labels = resolve_version_labels(&hashes, tags, orphaned);
    labels.first().ok_or_else(|| invalid("outbound all-versions head"))?;
    Ok(Staged { head: head.to_owned(), hashes, labels })
}

/// Maps each `Version` hash in `hashes` to its tag name from `tags` or `orphaned`, falling back to the hash.
#[inline]
fn resolve_version_labels(
    hashes: &[String],
    tags: &serde_json::Map<String, Value>,
    orphaned: Option<&serde_json::Map<String, Value>>,
) -> Vec<String> {
    hashes
        .iter()
        .map(|hash| {
            tags.iter()
                .chain(orphaned.into_iter().flat_map(serde_json::Map::iter))
                .find_map(|(tag, ref_hash)| {
                    (ref_hash.as_str().map(str::trim) == Some(hash.as_str()))
                        .then(|| tag.trim())
                        .filter(|tag| !tag.is_empty())
                        .map(str::to_owned)
                })
                .unwrap_or_else(|| hash.clone())
        })
        .collect()
}
