//! Stage the `VersionHistory` population performed while finding local snaps.
use super::{Moved, invalid};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::Path};

pub(super) fn prepare(
    moved: &mut Moved,
    directory: &Path,
    model: &Value,
    heads: &[String],
) -> io::Result<()> {
    let scope = model["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(invalid)?;
    let name = model["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(invalid)?;
    let hash = format!("{:x}", Sha1::digest(format!("{scope}/{name}:VersionHistory").as_bytes()));
    let path = directory
        .join(&hash[..2])
        .join(&hash[2..]);
    let mut history = if moved.read(&path)?.is_some() {
        moved.object(directory, &hash, "VersionHistory")?
    } else {
        json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]})
    };
    if history["name"] != name || history["scope"] != scope {
        return Err(invalid());
    }
    let original = history.clone();
    for head in heads {
        populate(moved, directory, &mut history, head)?;
    }
    if history != original {
        moved.objects.push((hash, "VersionHistory", history));
    }
    Ok(())
}

fn populate(
    moved: &mut Moved,
    directory: &Path,
    history: &mut Value,
    head: &str,
) -> io::Result<()> {
    let rows = history["versions"].as_array_mut().ok_or_else(invalid)?;
    if rows
        .iter()
        .any(|row| row["hash"] == head)
    {
        return Ok(());
    }
    let mut version = moved.object(directory, head, "Version")?;
    version["hash"] = json!(head);
    let result = crate::history_query::populate::begin(json!({
        "objectsDirectory":directory,"head":head,"headExists":false,"exitWhenFind":true,
        "existing":rows.iter().map(|row| row["hash"].clone()).collect::<Vec<_>>(),"headData":version,
    }))?;
    if result["complete"] != true {
        return Err(invalid());
    }
    for row in result["added"].as_array().ok_or_else(invalid)? {
        let reference = row["hash"].as_str().ok_or_else(invalid)?;
        moved.object(directory, reference, "Version")?;
        let mut record = json!({"hash":reference,"parents":row["parents"]});
        for key in ["unrelated", "squashed"] {
            if let Some(value) = row.get(key) {
                record[key] = value.clone();
            }
        }
        rows.push(record);
    }
    Ok(())
}
