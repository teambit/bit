//! Select the Version refs sent by staged, repeat and head-only exports.
use super::{Prepare, all_versions, invalid, repeat};
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn select_versions(
    input: &Prepare,
    model: &Value,
    objects_dir: &Path,
) -> io::Result<Staged> {
    let staged = if input.options.head_only {
        head_only(model)?
    } else if input.options.all || input.options.all_versions {
        all_versions::select(model, objects_dir)?
    } else if has_staged(model) {
        staged(model)?
    } else {
        repeat::select(model)?
    };
    Ok(staged)
}

fn head_only(model: &Value) -> io::Result<Staged> {
    let head = model["head"].as_str().ok_or_else(|| invalid("outbound head-only head"))?;
    crate::merge_history::hash(head)?;
    let labels = model["versions"]
        .as_object()
        .into_iter()
        .flat_map(|versions| versions.iter())
        .filter(|(_, hash)| hash.as_str() == Some(head))
        .map(|(tag, _)| tag.as_str())
        .collect::<Vec<_>>();
    let version = match labels.as_slice() {
        [] => head,
        [version] => *version,
        _ => return Err(invalid("outbound ambiguous head-only tags")),
    };
    Ok(Staged {
        head: head.to_owned(),
        hashes: vec![head.to_owned()],
        labels: vec![version.to_owned()],
    })
}

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
pub(super) struct Staged {
    pub(super) head: String,
    pub(super) hashes: Vec<String>,
    pub(super) labels: Vec<String>,
}

pub(super) fn staged(model: &Value) -> io::Result<Staged> {
    let rows =
        model["state"]["versions"].as_object().ok_or_else(|| invalid("outbound local versions"))?;
    let head = model["head"].as_str().ok_or_else(|| invalid("outbound non-head local Version"))?;
    crate::merge_history::hash(head)?;
    let mut version = None;
    let mut hashes = Vec::new();
    let mut labels = Vec::new();
    for (key, _) in rows
        .iter()
        .filter(|(_, row)| row["local"] == true)
    {
        // A tag names its Version through `versions`; a snap is its own hash.
        let hash = match model["versions"][key].as_str() {
            Some(hash) => hash,
            None if crate::merge_history::hash(key).is_ok() => key,
            None => return Err(invalid("outbound local Version ref")),
        };
        crate::merge_history::hash(hash)?;
        if hash == head {
            version = Some(key.clone());
        }
        if !hashes.iter().any(|known| known == hash) {
            hashes.push(hash.to_owned());
        }
        labels.push(key.clone());
    }
    version.ok_or_else(|| invalid("outbound non-head local Version"))?;
    Ok(Staged { head: head.to_owned(), hashes, labels })
}
