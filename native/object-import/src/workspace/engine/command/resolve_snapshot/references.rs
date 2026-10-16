use super::invalid;
use serde_json::{Map, Value, json};
use std::{collections::HashMap, io};

pub(super) fn rewrite_batch_refs(
    value: &mut Value,
    hashes: &HashMap<&str, &str>,
) -> io::Result<()> {
    match value {
        Value::Array(rows) => {
            for row in rows {
                rewrite_batch_refs(row, hashes)?;
            }
        }
        Value::Object(fields) => update_object(fields, hashes)?,
        _ => {}
    }
    Ok(())
}

fn update_object(fields: &mut Map<String, Value>, hashes: &HashMap<&str, &str>) -> io::Result<()> {
    update_scoped_id(fields, hashes);
    update_string_id(fields, hashes);
    update_root(fields, hashes)?;
    for (key, child) in fields {
        if key == "version" {
            update_marker(child, hashes)?;
        } else {
            rewrite_batch_refs(child, hashes)?;
        }
    }
    Ok(())
}

fn update_scoped_id(fields: &mut Map<String, Value>, hashes: &HashMap<&str, &str>) {
    let target = fields
        .get("scope")
        .and_then(Value::as_str)
        .zip(fields.get("name").and_then(Value::as_str))
        .and_then(|(scope, name)| {
            hashes
                .get(format!("{scope}/{name}").as_str())
                .copied()
        });
    if let Some(hash) = target
        && fields.contains_key("version")
    {
        fields.insert("version".into(), json!(hash));
    }
}

fn update_string_id(fields: &mut Map<String, Value>, hashes: &HashMap<&str, &str>) {
    let target = fields
        .get("id")
        .and_then(Value::as_str)
        .and_then(|text| text.rsplit_once('@'))
        .and_then(|(identity, _)| {
            hashes
                .get(identity)
                .map(|hash| (identity.to_owned(), *hash))
        });
    if let Some((identity, hash)) = target {
        fields.insert("id".into(), json!(format!("{identity}@{hash}")));
        if fields.contains_key("version") {
            fields.insert("version".into(), json!(hash));
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
