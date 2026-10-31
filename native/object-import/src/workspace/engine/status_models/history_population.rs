use super::{Reader, invalid};
use crate::workspace::engine::{dependency_graph::proof, status_history};
use serde_json::{Value, json};
use std::io;

pub(super) fn prepare(
    reader: &Reader<'_>,
    model: &Value,
    identity: &str,
    heads: &[Option<&str>],
    stage: bool,
) -> io::Result<(Value, Option<Value>)> {
    let hash = status_history::identity(identity);
    let mut proofs = Vec::new();
    let file = reader.directory
        .join(&hash[..2])
        .join(&hash[2..]);
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
fn populate(
    reader: &Reader<'_>,
    history: &mut Value,
    head: &str,
    stage: bool,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let rows = history["versions"].as_array().ok_or_else(|| invalid("status history rows"))?;
    if rows
        .iter()
        .any(|row| row["hash"] == head)
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
    if result["complete"] != true {
        return Err(invalid("status history missing ancestors"));
    }
    let added = result["added"].as_array().ok_or_else(|| invalid("status history population"))?;
    let rows = history["versions"].as_array_mut().ok_or_else(|| invalid("status history rows"))?;
    for row in added {
        if let Some(body) = row["versionJSON"].as_str() {
            let value = serde_json::from_str(body).map_err(io::Error::other)?;
            observe(
                reader,
                row["hash"].as_str().ok_or_else(|| invalid("history hash"))?,
                &value,
                proofs,
            )?;
        }
        rows.push(record(row));
    }
    Ok(())
}
fn record(row: &Value) -> Value {
    let mut result = json!({"hash":row["hash"],"parents":row["parents"]});
    for key in ["unrelated", "squashed"] {
        if let Some(value) = row.get(key) {
            result[key] = value.clone();
        }
    }
    result
}
fn observe(
    reader: &Reader<'_>,
    hash: &str,
    expected: &Value,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    crate::merge_history::hash(hash)?;
    proof::read(
        &reader.directory
            .join(&hash[..2])
            .join(&hash[2..]),
        proofs,
    )?;
    if reader.read(hash, "Version")? != *expected {
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
                    .to_owned()
            },
            |_| identity.to_owned(),
        );
    let hash = crate::validate::hexadecimal(&Sha1::digest(stored_id.as_bytes()));
    proof::read(
        &reader.directory
            .join(&hash[..2])
            .join(&hash[2..]),
        proofs,
    )?;
    if reader.read(&hash, "Component")? != *expected {
        return Err(invalid("status history model changed"));
    }
    Ok(())
}
