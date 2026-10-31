#[cfg(test)]
mod tests;

use super::{
    capture::{Capture, Object},
    invalid,
};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::Path};

pub(super) fn identity(component: &str) -> String {
    crate::validate::hexadecimal(&Sha1::digest(format!("{component}:VersionHistory").as_bytes()))
}
pub(super) fn populate(
    capture: &mut Capture,
    directory: &Path,
    model: &Value,
    head: &str,
) -> io::Result<(String, Value, bool)> {
    let (scope, name) = model_scope_and_name(model)?;
    let component = format!("{scope}/{name}");
    let hash = identity(&component);
    let old = capture.object(directory, &hash, "VersionHistory")?;
    let mut history = old
        .and_then(|record| record.value)
        .unwrap_or_else(|| json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]}));
    let existing = history["versions"].as_array().ok_or_else(|| invalid("import history rows"))?;
    if existing
        .iter()
        .any(|row| row["hash"] == head)
    {
        return Ok((hash, history, false));
    }
    let mut head_data = capture
        .object(directory, head, "Version")?
        .and_then(|record| record.value)
        .ok_or_else(|| invalid("import remote history head missing"))?;
    head_data["hash"] = json!(head);
    let result = crate::history_query::populate::begin(
        json!({"objectsDirectory":directory,"head":head,"headExists":false,"exitWhenFind":true,"existing":existing.iter().map(|row|row["hash"].clone()).collect::<Vec<_>>(),"headData":head_data}),
    )?;
    if result["complete"] != true {
        return Err(invalid("import remote history incomplete"));
    }
    append(capture, directory, &mut history, &result)?;
    Ok((hash, history, true))
}

fn model_scope_and_name(model: &Value) -> io::Result<(&str, &str)> {
    if let Some((scope, name)) = model["id"]
        .as_str()
        .or_else(|| model["identity"].as_str())
        .map(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base))
        .and_then(|base| base.split_once('/'))
    {
        return Ok((scope, name));
    }
    let scope = model["scope"]
        .as_str()
        .or_else(|| model["id"]["scope"].as_str())
        .ok_or_else(|| invalid("history scope"))?;
    let name = model["name"]
        .as_str()
        .or_else(|| model["id"]["name"].as_str())
        .ok_or_else(|| invalid("history name"))?;
    Ok((scope, name))
}
fn append(
    capture: &mut Capture,
    directory: &Path,
    history: &mut Value,
    result: &Value,
) -> io::Result<()> {
    let rows = history["versions"].as_array_mut().ok_or_else(|| invalid("import history rows"))?;
    for row in result["added"].as_array().ok_or_else(|| invalid("import populated rows"))? {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("import populated hash"))?;
        verify_ancestor(capture, directory, hash, row)?;
        let mut added = json!({"hash":hash,"parents":row["parents"]});
        for field in ["unrelated", "squashed"] {
            if let Some(value) = row.get(field) {
                added[field] = value.clone();
            }
        }
        rows.push(added);
    }
    Ok(())
}
fn verify_ancestor(
    capture: &mut Capture,
    directory: &Path,
    hash: &str,
    row: &Value,
) -> io::Result<()> {
    let record = capture
        .object(directory, hash, "Version")?
        .ok_or_else(|| invalid("import history ancestor missing"))?;
    if let Some(body) = row["versionJSON"].as_str() {
        let expected = crate::parse_jsonc(body.as_bytes())?;
        if record.value.as_ref() != Some(&expected) {
            return Err(invalid("import ancestor changed"));
        }
    }
    Ok(())
}
pub(super) fn merge(old: Option<&Object>, incoming: &Value) -> io::Result<Value> {
    let Some(old) = old.and_then(|record| record.value.as_ref()) else {
        return Ok(incoming.clone());
    };
    let previous = old["versions"].as_array().ok_or_else(|| invalid("import old history rows"))?;
    let received =
        incoming["versions"].as_array().ok_or_else(|| invalid("import incoming history rows"))?;
    let hashes: Vec<_> = previous
        .iter()
        .map(|row| row["hash"].clone())
        .collect();
    let retained = crate::operation::plan(
        json!({"kind":"versionHistory","existing":hashes,"stored":hashes,"incoming":received.iter().map(|row|row["hash"].clone()).collect::<Vec<_>>()}),
    )?;
    let mut rows = received.clone();
    for index in retained.as_array().ok_or_else(|| invalid("import history selection"))? {
        rows.push(
            previous
                .get(index.as_u64().ok_or_else(|| invalid("import history index"))? as usize)
                .ok_or_else(|| invalid("import history index bounds"))?
                .clone(),
        );
    }
    let mut result = old.clone();
    result["versions"] = json!(rows);
    Ok(result)
}
