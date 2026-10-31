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
    pub(super) update_dependents: Vec<String>,
    pub(super) heads: HashMap<String, String>,
    pub(super) own_remotes: HashMap<String, String>,
    pub(super) remotes: HashMap<String, String>,
}

pub(super) fn read(root: &Path, reader: &Reader<'_>, id: &str) -> io::Result<Option<Lane>> {
    let (scope, name) = parse_id(id)?;
    if name == "main" {
        return Ok(None);
    }
    let lane = local_object(root, reader, scope, name)?;
    let mut heads = component_heads(&lane)?;
    let forked_from = forked_from(&lane)?;
    let update_dependents = update_dependents(&lane)?;
    for (identity, hash) in &update_dependents {
        if heads.insert(identity.clone(), hash.clone()).is_some() {
            return Err(invalid("status duplicate lane update-dependent"));
        }
    }
    let own_remotes =
        if lane["isNew"] == true { HashMap::new() } else { remote(root, scope, name)? };
    let remotes = remote_with_parent(root, scope, name, forked_from.as_deref())?;
    Ok(Some(Lane {
        scope: scope.to_owned(),
        name: name.to_owned(),
        forked_from,
        update_dependents: update_dependents
            .into_iter()
            .map(|(identity, _)| identity)
            .collect(),
        heads,
        own_remotes,
        remotes,
    }))
}

fn remote_with_parent(
    root: &Path,
    scope: &str,
    name: &str,
    forked_from: Option<&str>,
) -> io::Result<HashMap<String, String>> {
    let mut remotes = remote(root, scope, name)?;
    if let Some((parent_scope, parent_name)) = forked_from.and_then(|id| id.split_once('/')) {
        for (identity, head) in remote(root, parent_scope, parent_name)? {
            remotes.entry(identity).or_insert(head);
        }
    }
    Ok(remotes)
}

fn update_dependents(lane: &Value) -> io::Result<Vec<(String, String)>> {
    let Some(value) = lane
        .get("updateDependents")
        .filter(|value| !value.is_null())
    else {
        return Ok(Vec::new());
    };
    let rows = value.as_array().ok_or_else(|| invalid("status lane update-dependents"))?;
    if rows.len() > 4096 {
        return Err(invalid("status lane update-dependent count"));
    }
    let mut seen = HashSet::new();
    rows.iter()
        .map(|row| {
            let row = row.as_str().ok_or_else(|| invalid("status lane update-dependent"))?;
            let (identity, hash) =
                row.rsplit_once('@').ok_or_else(|| invalid("status lane update-dependent id"))?;
            crate::merge_history::hash(hash)?;
            if identity.split_once('/').is_none() || !seen.insert(identity) {
                return Err(invalid("status lane update-dependent identity"));
            }
            Ok((identity.to_owned(), hash.to_owned()))
        })
        .collect()
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
        &Budget::new(4 * 1024 * 1024)
            .read(File::open(crate::scope_path(root).join("index.json"))?)?,
    )
    .map_err(io::Error::other)?;
    let rows = if index.is_array() {
        &[][..]
    } else {
        index["lanes"].as_array().ok_or_else(|| invalid("status lane index"))?
    };
    let row = rows
        .iter()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        .ok_or_else(|| invalid("status current lane missing"))?;
    let hash = row["hash"].as_str().ok_or_else(|| invalid("status lane hash"))?;
    let lane = reader.read(hash, "Lane")?;
    if lane["scope"] != scope || lane["name"] != name {
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
        let identity = format!("{component_scope}/{component_name}");
        if row["isHidden"] == true {
            continue;
        }
        if heads.insert(identity, head.to_owned()).is_some() {
            return Err(invalid("status duplicate lane component"));
        }
    }
    Ok(heads)
}

fn remote(root: &Path, scope: &str, name: &str) -> io::Result<HashMap<String, String>> {
    let path = crate::scope_path(root)
        .join("refs/remotes")
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
