use super::invalid;
use serde_json::{Value, json};
use std::{collections::HashSet, io};
fn rows<'a>(input: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    Ok(input[field]
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("merge dependency count"))?)
}
fn identity(value: &Value) -> io::Result<(Option<&str>, &str)> {
    let scope = match value.get("scope") {
        None | Some(Value::Null) => None,
        Some(Value::String(scope)) => Some(scope.as_str()),
        _ => return Err(invalid("merge dependency scope")),
    };
    let name = value["name"]
        .as_str()
        .filter(|name| !name.is_empty() && name.len() <= 4096)
        .ok_or_else(|| invalid("merge dependency name"))?;
    Ok((scope, name))
}
fn hashes(input: &Value, field: &str) -> io::Result<HashSet<String>> {
    rows(input, field)?
        .iter()
        .map(|value| {
            let hash = value.as_str().ok_or_else(|| invalid("merge dependency hash"))?;
            crate::merge_history::hash(hash)?;
            Ok(hash.to_owned())
        })
        .collect()
}
pub(super) fn candidates(input: &Value) -> io::Result<Value> {
    let scope = identity(&input["owner"])?.0;
    let mut checked = hashes(input, "checked")?;
    let mut added = Vec::new();
    let mut selected = Vec::new();
    for (index, dependency) in rows(input, "dependencies")?.iter().enumerate() {
        let dep_scope = identity(dependency)?.0;
        let version = dependency.get("version").and_then(Value::as_str);
        if dep_scope != scope {
            continue;
        }
        let Some(hash) = version.filter(|hash| crate::merge_history::hash(hash).is_ok()) else {
            continue;
        };
        if checked.insert(hash.to_owned()) {
            selected.push(index);
            added.push(hash);
        }
    }
    Ok(json!({"selected":selected,"checked":added}))
}
pub(super) fn missing(input: &Value) -> io::Result<Value> {
    let existing = hashes(input, "existing")?;
    let mut missing = Vec::new();
    for (index, value) in rows(input, "candidates")?.iter().enumerate() {
        let hash = value.as_str().ok_or_else(|| invalid("merge missing hash"))?;
        crate::merge_history::hash(hash)?;
        if !existing.contains(hash) {
            missing.push(index);
        }
    }
    Ok(json!({"missing":missing}))
}
pub(super) fn pattern(input: &Value) -> io::Result<Value> {
    let excluded = rows(input, "excluded")?
        .iter()
        .map(identity)
        .collect::<io::Result<HashSet<_>>>()?;
    let mut selected = Vec::new();
    for (index, dependency) in rows(input, "dependencies")?.iter().enumerate() {
        if excluded.contains(&identity(dependency)?) {
            selected.push(index);
        }
    }
    Ok(json!({"selected":selected}))
}

pub(super) fn outcome(input: &Value) -> io::Result<Value> {
    let has = super::decision::boolean(input, "hasDependencies")?;
    let include = super::decision::boolean(input, "includeDeps")?;
    let action = if !has {
        "none"
    } else if include {
        "add"
    } else if super::decision::boolean(input, "headMatches")? {
        "head"
    } else {
        "history"
    };
    Ok(json!({"action":action}))
}
