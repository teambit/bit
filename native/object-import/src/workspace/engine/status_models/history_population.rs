//! Populate and verify `VersionHistory` records via [`prepare`] and [`proof`] for status queries.

use super::{Reader, invalid};
use crate::workspace::engine::{dependency_graph::proof, status_history};
use serde_json::{Value, json};
use std::io;

/// Populates `VersionHistory` edges for `heads` and stages a proof-backed update plan when changed.
pub(super) fn prepare(
    reader: &Reader<'_>,
    model: &Value,
    identity: &str,
    heads: &[Option<&str>],
    stage: bool,
) -> io::Result<(Value, Option<Value>)> {
    let hash = status_history::identity(identity);
    let mut proofs = Vec::new();
    let file = object_path(reader.directory, &hash);
    let present = proof::read(&file, &mut proofs)?.is_some();
    let mut history = load_or_init_history(reader, model, identity, &hash, present, stage)?;
    let original = history.clone();
    for head in heads.iter().flatten() {
        populate(reader, &mut history, head, stage, &mut proofs)?;
    }
    let pending = if history == original {
        None
    } else {
        observe_model(reader, identity, model, &mut proofs)?;
        proof::verify(&proofs)?;
        Some(json!({"identity":identity,"history":history,"readSet":proofs}))
    };
    Ok((history["versions"].clone(), pending))
}

/// Loads an existing `VersionHistory` object at `hash` or initializes an empty one when `stage` is set.
/// Verifies that the loaded history's `name` and `scope` match `model` and `identity`.
fn load_or_init_history(
    reader: &Reader<'_>,
    model: &Value,
    identity: &str,
    hash: &str,
    present: bool,
    stage: bool,
) -> io::Result<Value> {
    let (id_scope, _) = identity
        .split_once('/')
        .unwrap_or(("", identity));
    let model_scope = model["scope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or(id_scope);
    let history = if present {
        reader.read(hash, "VersionHistory")?
    } else {
        if !stage {
            return Err(invalid("status history requires canonical population"));
        }
        json!({"name":model["name"],"scope":model_scope,"versions":[],"graphCompleteRefs":[]})
    };
    let history_scope = history["scope"]
        .as_str()
        .map(str::trim)
        .unwrap_or_default();
    if history["name"] != model["name"]
        || (!history_scope.is_empty() && !model_scope.is_empty() && history_scope != model_scope)
    {
        return Err(invalid("status history identity"));
    }
    Ok(history)
}
/// Populates missing ancestor `Version` edges for `head` into `history` when `stage` is enabled.
/// Records read-set proofs for every traversed `Version` object in `proofs`.
fn populate(
    reader: &Reader<'_>,
    history: &mut Value,
    head: &str,
    stage: bool,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let head = head.trim();
    let rows = history["versions"].as_array().ok_or_else(|| invalid("status history rows"))?;
    if rows
        .iter()
        .any(|row| row["hash"].as_str().map(str::trim) == Some(head))
    {
        return Ok(());
    }
    if !stage {
        return Err(invalid("status history requires canonical population"));
    }
    let mut version = reader.read(head, "Version")?;
    observe(reader, head, &version, proofs)?;
    version["hash"] = json!(head);
    let result = crate::history_query::populate::begin(json!({
        "objectsDirectory":reader.directory,"head":head,"headExists":false,"exitWhenFind":true,
        "existing":rows.iter().map(|row| row["hash"].clone()).collect::<Vec<_>>(),"headData":version,
    }))?;
    let added = (result["complete"] == true)
        .then(|| result["added"].as_array())
        .flatten()
        .ok_or_else(|| invalid("status history missing ancestors"))?;
    let rows = history["versions"].as_array_mut().ok_or_else(|| invalid("status history rows"))?;
    if rows.len().saturating_add(added.len()) > 4096 {
        return Err(invalid("status history version count"));
    }
    for row in added {
        observe_added(reader, row, proofs)?;
        rows.push(record(row));
    }
    Ok(())
}
#[inline]
fn observe_added(
    reader: &Reader<'_>,
    row: &Value,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let Some(body) = row["versionJSON"].as_str() else { return Ok(()) };
    let value = serde_json::from_str(body).map_err(io::Error::other)?;
    let hash = row["hash"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("history hash"))?;
    observe(reader, hash, &value, proofs)
}
#[inline]
fn record(row: &Value) -> Value {
    let mut result = json!({"hash":row["hash"],"parents":row["parents"]});
    for key in ["unrelated", "squashed"] {
        if let Some(value) = row
            .get(key)
            .filter(|value| !value.is_null())
        {
            result[key] = value.clone();
        }
    }
    result
}
#[inline]
fn observe(
    reader: &Reader<'_>,
    hash: &str,
    expected: &Value,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let hash = crate::validate::hexadecimal(&crate::merge_history::hash(hash.trim())?);
    proof::read(&object_path(reader.directory, &hash), proofs)?;
    if reader.read(&hash, "Version")? != *expected {
        return Err(invalid("status history ancestor changed"));
    }
    Ok(())
}

fn observe_model(
    reader: &Reader<'_>,
    identity: &str,
    expected: &Value,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    use sha1::{Digest, Sha1};
    let stored_id = expected["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map_or_else(
            || {
                expected["name"]
                    .as_str()
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .unwrap_or(identity)
            },
            |_| identity,
        );
    let hash = crate::validate::hexadecimal(&Sha1::digest(stored_id.as_bytes()));
    proof::read(&object_path(reader.directory, &hash), proofs)?;
    if reader.read(&hash, "Component")? != *expected {
        return Err(invalid("status history model changed"));
    }
    Ok(())
}

#[inline]
fn object_path(directory: &std::path::Path, hash: &str) -> std::path::PathBuf {
    directory
        .join(&hash[..2])
        .join(&hash[2..])
}
