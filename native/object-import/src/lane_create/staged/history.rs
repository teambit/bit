//! Stage the `VersionHistory` population ([`prepare`], [`populate`], [`added_record`], [`Moved`], [`Sha1`]) performed while finding local snaps for lane creation.
use super::{Moved, invalid};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::Path};

/// Populates and stages the `VersionHistory` object for `model` across `heads` in `moved`.
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
    let mut sha1 = Sha1::new();
    sha1.update(scope.as_bytes());
    sha1.update(b"/");
    sha1.update(name.as_bytes());
    sha1.update(b":VersionHistory");
    let hash = crate::validate::hexadecimal(&sha1.finalize());
    let path = directory
        .join(&hash[..2])
        .join(&hash[2..]);
    let mut history = if moved.read(&path)?.is_some() {
        moved.object(directory, &hash, "VersionHistory")?
    } else {
        json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]})
    };
    if history["name"].as_str().map(str::trim) != Some(name)
        || history["scope"].as_str().map(str::trim) != Some(scope)
    {
        return Err(invalid());
    }
    let initial_len = history["versions"].as_array().map_or(0, Vec::len);
    for head in heads {
        populate(moved, directory, &mut history, head)?;
    }
    if history["versions"].as_array().map_or(0, Vec::len) != initial_len {
        moved.objects.push((hash, "VersionHistory", history));
    }
    Ok(())
}

/// Recursively populates `history["versions"]` ([`Value`]) in `moved` ([`Moved`]) starting from `head` in `directory`.
fn populate(
    moved: &mut Moved,
    directory: &Path,
    history: &mut Value,
    head: &str,
) -> io::Result<()> {
    let head = head.trim();
    let rows = history["versions"].as_array_mut().ok_or_else(invalid)?;
    if rows
        .iter()
        .any(|row| {
            row["hash"]
                .as_str()
                .map(str::trim)
                .is_some_and(|existing| existing.eq_ignore_ascii_case(head))
        })
    {
        return Ok(());
    }
    let mut version = moved.object(directory, head, "Version")?;
    version["hash"] = json!(head);
    let existing = rows
        .iter()
        .filter_map(|row| row["hash"].as_str().map(str::trim))
        .filter(|existing| !existing.is_empty())
        .collect::<Vec<_>>();
    let result = crate::history_query::populate::begin(json!({
        "objectsDirectory":directory,"head":head,"headExists":false,"exitWhenFind":true,
        "existing":existing,"headData":version,
    }))?;
    if result["complete"] != true {
        return Err(invalid());
    }
    for row in result["added"].as_array().ok_or_else(invalid)? {
        rows.push(added_record(moved, directory, row)?);
    }
    Ok(())
}

/// Validates a populated `Version` row (`hash`, `parents`, `unrelated`, `squashed`) and records its read.
#[inline]
fn added_record(moved: &mut Moved, directory: &Path, row: &Value) -> io::Result<Value> {
    let reference = row["hash"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(invalid)?;
    let parents = row["parents"].as_array().ok_or_else(invalid)?;
    moved.object(directory, reference, "Version")?;
    let mut record = json!({"hash":reference,"parents":parents});
    for key in ["unrelated", "squashed"] {
        if let Some(value) = row.get(key) {
            record[key] = value.clone();
        }
    }
    Ok(record)
}
