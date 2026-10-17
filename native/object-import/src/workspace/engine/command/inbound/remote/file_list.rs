//! `Fs.list` / `ComponentsList.listLocalScope` for a configured bare file scope.
use super::{Listed, invalid, lane_list};
use crate::{checkout::repository, command_import::lane, read_budget::Budget};
use regress::Regex;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{collections::HashSet, fs::File, io, path::Path};

pub(super) fn list(path: &Path, scope: &str, namespaces: &str) -> io::Result<Vec<Listed>> {
    let config: Value = serde_json::from_slice(
        &Budget::new(1024 * 1024).read(File::open(path.join("scope.json"))?)?,
    )?;
    if config["name"] != scope
        || config["lanes"]["current"]
            .as_str()
            .is_some_and(|lane| lane != "main")
    {
        return Err(invalid("inbound file scope identity or lane"));
    }
    collect(path, scope, &matcher(scope, namespaces)?, &index(path)?)
}

fn index(path: &Path) -> io::Result<Vec<Value>> {
    let index: Value = serde_json::from_slice(
        &Budget::new(4 * 1024 * 1024).read(File::open(path.join("index.json"))?)?,
    )?;
    let rows = if index.is_array() { &index } else { &index["components"] };
    let rows = rows.as_array().ok_or_else(|| invalid("inbound file index"))?;
    if rows.len() > 4096 {
        return Err(invalid("inbound file index limit"));
    }
    Ok(rows.clone())
}

fn collect(path: &Path, scope: &str, pattern: &Regex, rows: &[Value]) -> io::Result<Vec<Listed>> {
    let mut seen = HashSet::new();
    let mut compressed = 0;
    let mut listed = Vec::new();
    for row in rows {
        let (name, hash) = indexed(row, scope, &mut seen)?;
        if pattern
            .find(&format!("{scope}/{name}"))
            .is_none()
        {
            continue;
        }
        let model = object(path, &hash, "Component", &mut compressed)?;
        if model["scope"] != scope || model["name"] != name {
            return Err(invalid("inbound file model identity"));
        }
        if let Some(item) = component(path, scope, &name, &model, &mut compressed)? {
            listed.push(item);
        }
    }
    Ok(listed)
}

pub(super) fn matcher(scope: &str, namespaces: &str) -> io::Result<Regex> {
    if namespaces.is_empty() || namespaces.len() > 4096 {
        return Err(invalid("inbound file pattern"));
    }
    let full = if namespaces.starts_with(&format!("{scope}/")) {
        namespaces.to_owned()
    } else {
        format!("{scope}/{namespaces}")
    };
    Regex::new(&format!("^{}$", full.replace('*', ".*"))).map_err(io::Error::other)
}

pub(super) fn lane(path: &Path, id: &lane::Id) -> io::Result<Vec<Listed>> {
    let hash = lane_hash(path, id)?;
    let mut compressed = 0;
    let value = object(path, &hash, "Lane", &mut compressed)?;
    lane::validate_value(id, &value)?;
    lane_list::visible(lane::entries(&value)?)
}

fn lane_hash(path: &Path, id: &lane::Id) -> io::Result<String> {
    let index: Value = serde_json::from_slice(
        &Budget::new(4 * 1024 * 1024).read(File::open(path.join("index.json"))?)?,
    )?;
    let rows = index["lanes"].as_array().ok_or_else(|| invalid("inbound file lane index"))?;
    let matching = rows
        .iter()
        .filter(|row| row["id"]["scope"] == id.scope && row["id"]["name"] == id.name)
        .collect::<Vec<_>>();
    if matching.len() != 1 {
        return Err(invalid("inbound file lane identity"));
    }
    matching[0]["hash"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("inbound file lane hash"))
}

fn indexed(row: &Value, scope: &str, seen: &mut HashSet<String>) -> io::Result<(String, String)> {
    let name = row["id"]["name"].as_str().ok_or_else(|| invalid("inbound file index name"))?;
    let hash = row["hash"].as_str().ok_or_else(|| invalid("inbound file index hash"))?;
    if row["id"]["scope"] != scope
        || row["isSymlink"] != false
        || !seen.insert(name.to_owned())
        || crate::validate::hexadecimal(&Sha1::digest(format!("{scope}/{name}").as_bytes())) != hash
    {
        return Err(invalid("inbound file index identity"));
    }
    Ok((name.to_owned(), hash.to_owned()))
}

fn object(path: &Path, hash: &str, kind: &str, compressed: &mut usize) -> io::Result<Value> {
    let identity = crate::merge_history::hash(hash)?;
    let raw = repository::read(&path.join("objects"), identity, 32 * 1024 * 1024, compressed)?;
    let (_, body) = repository::split(&raw, identity, kind)?;
    serde_json::from_slice(body).map_err(io::Error::other)
}

fn component(
    path: &Path,
    scope: &str,
    name: &str,
    model: &Value,
    compressed: &mut usize,
) -> io::Result<Option<Listed>> {
    let Some(head) = model["head"].as_str() else { return Ok(None) };
    let version = object(path, head, "Version", compressed)?;
    crate::history_query::validate_version(&version)?;
    if extension(&version, "teambit.component/remove", "removed") {
        return Ok(None);
    }
    let deprecated = model["deprecated"] == true
        || extension(&version, "teambit.component/deprecation", "deprecate");
    let latest = super::super::details::head_as_tag_or_hash(model)?;
    Ok(Some(Listed {
        scope: scope.to_owned(),
        name: name.to_owned(),
        version: Some(latest),
        deprecated,
    }))
}

fn extension(version: &Value, name: &str, flag: &str) -> bool {
    version["extensions"]
        .as_array()
        .is_some_and(|extensions| {
            extensions
                .iter()
                .any(|extension| extension["name"] == name && truthy(&extension["config"][flag]))
        })
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|value| value != 0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}
