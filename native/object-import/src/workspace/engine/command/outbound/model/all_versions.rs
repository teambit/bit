//! Select the complete local Version ancestry for `ExportCmd --all-versions`.
use super::{Staged, history::parents, invalid};
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

pub(super) fn select(model: &Value, dir: &Path) -> io::Result<Staged> {
    let head = model["head"].as_str().ok_or_else(|| invalid("outbound all-versions head"))?;
    crate::merge_history::hash(head)?;
    let tags =
        model["versions"].as_object().ok_or_else(|| invalid("outbound all-versions tags"))?;
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
                .map(str::to_owned),
        );
        hashes.push(hash);
    }
    let labels = hashes
        .iter()
        .map(|hash| {
            tags.iter()
                .find(|(_, ref_hash)| ref_hash.as_str() == Some(hash))
                .map_or_else(|| hash.clone(), |(tag, _)| tag.clone())
        })
        .collect::<Vec<_>>();
    labels.first().ok_or_else(|| invalid("outbound all-versions head"))?;
    Ok(Staged { head: head.to_owned(), hashes, labels })
}
