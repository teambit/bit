//! Active [`Lane`] object loading via [`read`], component head extraction, and remote ref resolution.

use super::{Reader, invalid};
use crate::read_budget::Budget;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io,
    path::Path,
};

/// Active local lane metadata, component heads, and remote lane ref mappings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Lane {
    pub(super) scope: String,
    pub(super) name: String,
    pub(super) forked_from: Option<String>,
    pub(super) update_dependents: Vec<String>,
    pub(super) heads: HashMap<String, String>,
    pub(super) own_remotes: HashMap<String, String>,
    pub(super) remotes: HashMap<String, String>,
}

/// Reads the active [`Lane`] object and remote head mappings for `id` when not on `main`.
pub(super) fn read(root: &Path, reader: &Reader<'_>, id: &str) -> io::Result<Option<Lane>> {
    let (scope, name) = parse_id(id)?;
    if name == "main" {
        return Ok(None);
    }
    let lane = local_object(root, reader, scope, name)?;
    let mut heads = component_heads(&lane, scope)?;
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

/// Loads remote lane head mappings for `scope/name` and merges fallback entries from [`forked_from`].
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

/// Parses and validates `updateDependents` `<scope>/<name>@<sha1>` entries from `lane`.
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
    let mut seen = HashSet::with_capacity(rows.len());
    rows.iter()
        .map(|row| {
            let row = row
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("status lane update-dependent"))?;
            let (identity, hash) =
                row.rsplit_once('@').ok_or_else(|| invalid("status lane update-dependent id"))?;
            let identity = identity.trim();
            let hash = hash.trim();
            crate::merge_history::hash(hash)?;
            if !identity
                .split_once('/')
                .is_some_and(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty())
                || !seen.insert(identity)
            {
                return Err(invalid("status lane update-dependent identity"));
            }
            Ok((identity.to_owned(), hash.to_owned()))
        })
        .collect()
}

#[inline]
fn forked_from(lane: &Value) -> io::Result<Option<String>> {
    let Some(value) = lane
        .get("forkedFrom")
        .filter(|value| !value.is_null())
    else {
        return Ok(None);
    };
    let scope = value["scope"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("status forked lane scope"))?;
    let name = value["name"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("status forked lane name"))?;
    let id = format!("{scope}/{name}");
    parse_id(&id)?;
    Ok(Some(id))
}

#[inline]
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
    let index: Value = crate::parse_jsonc(
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
        .find(|row| {
            row["isSymlink"] != true
                && crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                    row, scope, name,
                )
        })
        .ok_or_else(|| invalid("status current lane missing"))?;
    let hash = row["hash"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("status lane hash"))?;
    crate::merge_history::hash(hash)?;
    let lane = reader.read(hash, "Lane")?;
    let lane_scope = lane["scope"]
        .as_str()
        .map(str::trim)
        .unwrap_or_default();
    if (!lane_scope.is_empty() && lane_scope != scope)
        || lane["name"].as_str().map(str::trim) != Some(name)
    {
        return Err(invalid("status complex lane requires canonical loading"));
    }
    Ok(lane)
}

fn component_heads(lane: &Value, default_scope: &str) -> io::Result<HashMap<String, String>> {
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("status lane components"))?;
    if components.len() > 4096 {
        return Err(invalid("status lane component count"));
    }
    let mut heads = HashMap::with_capacity(components.len());
    for row in components {
        let (scope_opt, component_name) =
            crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
                .ok_or_else(|| invalid("status lane component name"))?;
        let component_scope = scope_opt
            .filter(|scope| !scope.is_empty())
            .unwrap_or(default_scope);
        let head = row["head"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("status lane component head"))?;
        let head = crate::validate::hexadecimal(&crate::merge_history::hash(head)?);
        let identity = format!("{component_scope}/{component_name}");
        if row["isHidden"] == true {
            continue;
        }
        if heads.insert(identity, head).is_some() {
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
    let rows: Value =
        crate::parse_jsonc(&Budget::new(4 * 1024 * 1024).read(file)?).map_err(io::Error::other)?;
    let rows = rows
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("status lane remote refs"))?;
    let mut remotes = HashMap::with_capacity(rows.len());
    for row in rows {
        let (component_scope, component_name) =
            crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(row)
                .ok_or_else(|| invalid("status lane remote scope"))?;
        let head = row["head"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("status lane remote head"))?;
        let head = crate::validate::hexadecimal(&crate::merge_history::hash(head)?);
        let id = format!("{component_scope}/{component_name}");
        if remotes.insert(id, head).is_some() {
            return Err(invalid("status duplicate lane remote ref"));
        }
    }
    Ok(remotes)
}
