//! Persist selected pending main-lane versions in `VersionHistory` before resetting them.

use super::{ObjectChange, invalid, outbound, selection::Selection};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{fs, io, path::Path};

pub(super) fn pending(
    root: &Path,
    identity: &str,
    component: &Value,
    selection: &Selection,
) -> io::Result<Option<ObjectChange>> {
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("reset history identity"))?;
    let current = component["head"].as_str().ok_or_else(|| invalid("reset history head"))?;
    crate::merge_history::hash(current)?;
    let hash = format!("{:x}", Sha1::digest(format!("{identity}:VersionHistory").as_bytes()));
    let objects = root.join(".bit/objects");
    let path = super::repository::object_path(root, &hash);
    let (mut history, before) = match fs::read(&path) {
        Ok(before) => (outbound::read_object(&objects, &hash, "VersionHistory")?, before),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            (json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]}), Vec::new())
        }
        Err(error) => return Err(error),
    };
    if history["scope"] != scope || history["name"] != name {
        return Err(invalid("reset VersionHistory identity"));
    }
    if !append_removed(&objects, &mut history, selection)? {
        return Ok(None);
    }
    Ok(Some(ObjectChange {
        hash: hash.clone(),
        before,
        after: Some(outbound::encode_object(&hash, "VersionHistory", &history)?),
    }))
}

fn append_removed(objects: &Path, history: &mut Value, selection: &Selection) -> io::Result<bool> {
    let versions =
        history["versions"].as_array_mut().ok_or_else(|| invalid("reset history versions"))?;
    let mut changed = false;
    for reference in &selection.removed {
        if versions
            .iter()
            .any(|entry| entry["hash"] == *reference)
        {
            continue;
        }
        let version = outbound::read_object(objects, reference, "Version")?;
        versions.push(json!({"hash":reference,"parents":version["parents"]}));
        changed = true;
    }
    Ok(changed)
}
