use super::{Reader, invalid};
use crate::read_budget::Budget;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io,
    path::Path,
};

pub(super) struct Lane {
    pub(super) scope: String,
    pub(super) name: String,
    pub(super) forked_from: Option<String>,
    pub(super) heads: HashMap<String, String>,
    pub(super) remotes: HashMap<String, String>,
}

pub(super) fn read(root: &Path, reader: &Reader<'_>, id: &str) -> io::Result<Option<Lane>> {
    let (scope, name) = parse_id(id)?;
    if name == "main" {
        return Ok(None);
    }
    let lane = local_object(root, reader, scope, name)?;
    let heads = component_heads(&lane)?;
    let forked_from = forked_from(&lane)?;
    let remotes = remote(root, scope, name)?;
    if remotes
        .keys()
        .any(|key| !heads.contains_key(key))
    {
        return Err(invalid("status lane remote component mismatch"));
    }
    Ok(Some(Lane { scope: scope.to_owned(), name: name.to_owned(), forked_from, heads, remotes }))
}

fn forked_from(lane: &Value) -> io::Result<Option<String>> {
    let Some(value) = lane
        .get("forkedFrom")
        .filter(|value| !value.is_null())
    else {
        return Ok(None);
    };
    let scope = value["scope"].as_str().ok_or_else(|| invalid("status forked lane scope"))?;
    let name = value["name"].as_str().ok_or_else(|| invalid("status forked lane name"))?;
    parse_id(&format!("{scope}/{name}"))?;
    Ok(Some(format!("{scope}/{name}")))
}

fn parse_id(id: &str) -> io::Result<(&str, &str)> {
    let (scope, name) = id.split_once('/').ok_or_else(|| invalid("status lane id"))?;
    if [scope, name]
        .iter()
        .any(|part| {
            part.is_empty()
                || *part == "."
                || *part == ".."
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        })
    {
        return Err(invalid("status lane id"));
    }
    Ok((scope, name))
}

fn local_object(root: &Path, reader: &Reader<'_>, scope: &str, name: &str) -> io::Result<Value> {
    let index: Value = serde_json::from_slice(
        &Budget::new(4 * 1024 * 1024).read(File::open(root.join(".bit/index.json"))?)?,
    )
    .map_err(io::Error::other)?;
    let rows = index["lanes"].as_array().ok_or_else(|| invalid("status lane index"))?;
    let row = rows
        .iter()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        .ok_or_else(|| invalid("status current lane missing"))?;
    let hash = row["hash"].as_str().ok_or_else(|| invalid("status lane hash"))?;
    let lane = reader.read(hash, "Lane")?;
    if lane["scope"] != scope
        || lane["name"] != name
        || lane["updateDependents"]
            .as_array()
            .is_some_and(|rows| !rows.is_empty())
    {
        return Err(invalid("status complex lane requires canonical loading"));
    }
    Ok(lane)
}

fn component_heads(lane: &Value) -> io::Result<HashMap<String, String>> {
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("status lane components"))?;
    if components.len() > 4096 {
        return Err(invalid("status lane component count"));
    }
    let mut heads = HashMap::new();
    for row in components {
        if row["isDeleted"] == true || row["isRemoved"] == true || row["isHidden"] == true {
            return Err(invalid("status removed lane component requires canonical loading"));
        }
        let component_scope = row["id"]["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("status lane component scope"))?;
        let component_name = row["id"]["name"]
            .as_str()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("status lane component name"))?;
        let head = row["head"].as_str().ok_or_else(|| invalid("status lane component head"))?;
        crate::merge_history::hash(head)?;
        if heads
            .insert(format!("{component_scope}/{component_name}"), head.to_owned())
            .is_some()
        {
            return Err(invalid("status duplicate lane component"));
        }
    }
    Ok(heads)
}

fn remote(root: &Path, scope: &str, name: &str) -> io::Result<HashMap<String, String>> {
    let path = root
        .join(".bit/refs/remotes")
        .join(scope)
        .join(name);
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(error),
    };
    let rows: Value = serde_json::from_slice(&Budget::new(4 * 1024 * 1024).read(file)?)
        .map_err(io::Error::other)?;
    let rows = rows
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("status lane remote refs"))?;
    let mut seen = HashSet::new();
    let mut remotes = HashMap::new();
    for row in rows {
        let component_scope =
            row["id"]["scope"].as_str().ok_or_else(|| invalid("status lane remote scope"))?;
        let component_name =
            row["id"]["name"].as_str().ok_or_else(|| invalid("status lane remote name"))?;
        let head = row["head"].as_str().ok_or_else(|| invalid("status lane remote head"))?;
        crate::merge_history::hash(head)?;
        let id = format!("{component_scope}/{component_name}");
        if !seen.insert(id.clone()) {
            return Err(invalid("status duplicate lane remote ref"));
        }
        remotes.insert(id, head.to_owned());
    }
    Ok(remotes)
}
