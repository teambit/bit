use super::invalid;
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

pub(super) fn rewrite_batch_refs(
    value: &mut Value,
    hashes: &HashMap<&str, &str>,
    pinned: &HashSet<String>,
) -> io::Result<()> {
    match value {
        Value::Array(rows) => {
            for row in rows {
                rewrite_batch_refs(row, hashes, pinned)?;
            }
        }
        Value::Object(fields) => update_object(fields, hashes, pinned)?,
        _ => {}
    }
    Ok(())
}

fn update_object(
    fields: &mut Map<String, Value>,
    hashes: &HashMap<&str, &str>,
    pinned: &HashSet<String>,
) -> io::Result<()> {
    update_scoped_id(fields, hashes, pinned);
    update_string_id(fields, hashes, pinned);
    update_root(fields, hashes)?;
    for (key, child) in fields {
        if key == "version" {
            update_marker(child, hashes)?;
        } else if key == "extensionId" {
            rewrite_batch_refs(child, hashes, &HashSet::new())?;
        } else {
            rewrite_batch_refs(child, hashes, pinned)?;
        }
    }
    Ok(())
}

fn update_scoped_id(
    fields: &mut Map<String, Value>,
    hashes: &HashMap<&str, &str>,
    pinned: &HashSet<String>,
) {
    let target = fields
        .get("scope")
        .and_then(Value::as_str)
        .zip(fields.get("name").and_then(Value::as_str))
        .and_then(|(scope, name)| {
            let identity = format!("{scope}/{name}");
            let is_marker = fields
                .get("version")
                .and_then(Value::as_str)
                .is_some_and(|ver| ver.starts_with("__bit_pending_snapshot__:"));
            if !is_marker && pinned.contains(&identity) {
                return None;
            }
            hashes.get(identity.as_str()).copied()
        });
    if let Some(hash) = target
        && fields.contains_key("version")
    {
        fields.insert("version".into(), json!(hash));
    }
}

fn resolve_string_target<'a>(
    fields: &Map<String, Value>,
    key: &str,
    hashes: &HashMap<&str, &'a str>,
    pinned: &HashSet<String>,
) -> Option<(String, &'a str)> {
    let (identity, ver) = fields
        .get(key)?
        .as_str()?
        .rsplit_once('@')?;
    if !ver.starts_with("__bit_pending_snapshot__:") && pinned.contains(identity) {
        return None;
    }
    hashes
        .get(identity)
        .map(|hash| (identity.to_owned(), *hash))
}

fn update_string_id(
    fields: &mut Map<String, Value>,
    hashes: &HashMap<&str, &str>,
    pinned: &HashSet<String>,
) {
    for key in ["id", "componentId", "identity"] {
        if let Some((identity, hash)) = resolve_string_target(fields, key, hashes, pinned) {
            fields.insert(key.into(), json!(format!("{identity}@{hash}")));
            if key == "id" && fields.contains_key("version") {
                fields.insert("version".into(), json!(hash));
            }
        }
    }
}

fn update_marker(child: &mut Value, hashes: &HashMap<&str, &str>) -> io::Result<()> {
    let Some(identity) = child
        .as_str()
        .and_then(|text| text.strip_prefix("__bit_pending_snapshot__:"))
    else {
        return Ok(());
    };
    *child = json!(hashes.get(identity).ok_or_else(|| invalid("unallocated batch dependency"))?);
    Ok(())
}

fn update_root(fields: &mut Map<String, Value>, versions: &HashMap<&str, &str>) -> io::Result<()> {
    let Some((identity, version)) = fields
        .get("root")
        .and_then(Value::as_str)
        .and_then(|root| root.rsplit_once('@'))
    else {
        return Ok(());
    };
    if version.strip_prefix("__bit_pending_snapshot__:") == Some(identity) {
        let version =
            versions.get(identity).ok_or_else(|| invalid("unallocated workspace root"))?;
        fields.insert("root".into(), json!(format!("{identity}@{version}")));
    }
    Ok(())
}
