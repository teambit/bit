//! Canonical local `VersionHistory` updates for component and lane exports.
use super::{HistoryBytes, encode, invalid, read_object};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashSet, io, path::Path};

pub(super) fn prepare_history(
    dir: &Path,
    scope: &str,
    name: &str,
    head: &str,
) -> io::Result<HistoryBytes> {
    let (scope, name, head) = (scope.trim(), name.trim(), head.trim());
    crate::merge_history::hash(head)?;
    let hash = crate::validate::hexadecimal(&Sha1::digest(
        format!("{scope}/{name}:VersionHistory").as_bytes(),
    ));
    let (bytes, hashes) = history(dir, scope, name, head, &hash)?;
    Ok(HistoryBytes { hash, bytes, hashes })
}

fn history(
    dir: &Path,
    scope: &str,
    name: &str,
    head: &str,
    history_hash: &str,
) -> io::Result<(Vec<u8>, Vec<String>)> {
    let path = dir
        .join(&history_hash[..2])
        .join(&history_hash[2..]);
    let mut value = if path.try_exists()? {
        read_object(dir, history_hash, "VersionHistory")?
    } else {
        json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]})
    };
    if value["name"] != name || value["scope"] != scope {
        return Err(invalid("outbound VersionHistory identity"));
    }
    let rows =
        value["versions"].as_array_mut().ok_or_else(|| invalid("outbound VersionHistory rows"))?;
    populate(rows, dir, head)?;
    let hashes = rows
        .iter()
        .filter_map(|row| row["hash"].as_str().map(str::to_owned))
        .collect();
    Ok((encode(history_hash, "VersionHistory", &value)?, hashes))
}
fn version_row(dir: &Path, hash: &str) -> io::Result<Value> {
    let version = read_object(dir, hash, "Version")?;
    let mut row = json!({"hash":hash,"parents":refs(&version["parents"])?});
    if let Some(unrelated) = version
        .get("unrelated")
        .filter(|value| !value.is_null())
    {
        let head = ref_str(&unrelated["head"]).ok_or_else(|| invalid("outbound unrelated head"))?;
        crate::merge_history::hash(head)?;
        row["unrelated"] = json!(head);
    }
    if let Some(squashed) = version
        .get("squashed")
        .filter(|value| !value.is_null())
    {
        row["squashed"] = refs(&squashed["previousParents"])?;
    }
    Ok(row)
}

fn refs(value: &Value) -> io::Result<Value> {
    let mut list = Vec::new();
    for parent in value.as_array().ok_or_else(|| invalid("outbound Version parent list"))? {
        let hash = ref_str(parent).ok_or_else(|| invalid("outbound Version parent"))?;
        crate::merge_history::hash(hash)?;
        list.push(Value::String(hash.to_owned()));
    }
    Ok(Value::Array(list))
}

fn ref_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value["ref"].as_str())
        .or_else(|| value["hash"].as_str())
        .map(str::trim)
}

pub(super) fn parents(dir: &Path, hash: &str) -> io::Result<Value> {
    let version = read_object(dir, hash, "Version")?;
    refs(&version["parents"])
}

fn populate(rows: &mut Vec<Value>, dir: &Path, head: &str) -> io::Result<()> {
    let mut known = rows
        .iter()
        .map(|row| {
            row["hash"]
                .as_str()
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| invalid("outbound VersionHistory hash"))
        })
        .collect::<io::Result<HashSet<_>>>()?;
    let mut pending = vec![head.to_owned()];
    while let Some(hash) = pending.pop() {
        if !known.insert(hash.clone()) {
            continue;
        }
        if known.len() > 4096 {
            return Err(invalid("outbound VersionHistory bounds"));
        }
        let row = version_row(dir, &hash)?;
        pending.extend(
            row["parents"]
                .as_array()
                .ok_or_else(|| invalid("outbound Version parents"))?
                .iter()
                .rev()
                .filter_map(Value::as_str)
                .map(str::to_owned),
        );
        rows.push(row);
    }
    Ok(())
}
