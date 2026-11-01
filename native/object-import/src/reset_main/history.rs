//! Persist selected pending `main`-lane versions in `VersionHistory` before resetting them.

use super::{ObjectChange, invalid, outbound, selection::Selection};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{fs, io, path::Path};

/// Persist selected pending main-lane versions in `VersionHistory` before resetting them.
pub(super) fn pending(
    root: &Path,
    identity: &str,
    component: &Value,
    selection: &Selection,
) -> io::Result<Option<ObjectChange>> {
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("reset history identity"))?;
    let current = component["head"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("reset history head"))?;
    crate::merge_history::hash(current)?;
    let mut hasher = Sha1::new();
    hasher.update(identity.as_bytes());
    hasher.update(b":VersionHistory");
    let hash = crate::validate::hexadecimal(&hasher.finalize());
    let objects = crate::scope_path(root).join("objects");
    let path = objects
        .join(&hash[..2])
        .join(&hash[2..]);
    let (mut history, before) = load_or_init_history(&path, &objects, &hash, scope, name)?;
    let hist_scope = history["scope"].as_str().map_or("", str::trim);
    if (!hist_scope.is_empty() && hist_scope != scope)
        || history["name"].as_str().map(str::trim) != Some(name)
    {
        return Err(invalid("reset VersionHistory identity"));
    }
    if !append_removed(&objects, &mut history, selection)? {
        return Ok(None);
    }
    let after = outbound::encode_object(&hash, "VersionHistory", &history)?;
    Ok(Some(ObjectChange { hash, before, after: Some(after) }))
}

fn append_removed(objects: &Path, history: &mut Value, selection: &Selection) -> io::Result<bool> {
    let versions =
        history["versions"].as_array_mut().ok_or_else(|| invalid("reset history versions"))?;
    let mut changed = false;
    for reference in &selection.removed {
        if versions
            .iter()
            .any(|entry| {
                entry["hash"]
                    .as_str()
                    .map(str::trim)
                    .is_some_and(|hash| hash.eq_ignore_ascii_case(reference))
            })
        {
            continue;
        }
        let version = outbound::read_object(objects, reference, "Version")?;
        let parents =
            version["parents"].as_array().ok_or_else(|| invalid("reset history parents"))?;
        let mut entry = json!({"hash":reference,"parents":parents});
        if let Some(unrelated) = version["unrelated"]["head"]
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())
        {
            entry["unrelated"] = json!(unrelated);
        }
        if let Some(squashed) = version["squashed"]["previousParents"].as_array() {
            entry["squashed"] = json!(squashed);
        }
        versions.push(entry);
        changed = true;
    }
    Ok(changed)
}

fn load_or_init_history(
    path: &Path,
    objects: &Path,
    hash: &str,
    scope: &str,
    name: &str,
) -> io::Result<(Value, Vec<u8>)> {
    match fs::read(path) {
        Ok(before) => Ok((outbound::read_object(objects, hash, "VersionHistory")?, before)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok((
            json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]}),
            Vec::new(),
        )),
        Err(error) => Err(error),
    }
}
