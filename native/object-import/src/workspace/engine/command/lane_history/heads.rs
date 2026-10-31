//! Merge-pending checks on a lane use lane heads, including a new lane's absent remote head.
use crate::workspace::engine::{command::Record, dependency_graph::proof, invalid};
use serde_json::Value;
use std::io;

pub(in crate::workspace::engine::command) fn remote(
    record: &mut Record,
    identity: &str,
) -> io::Result<Option<String>> {
    if record.context["lane"]["current"]["isNew"] == true {
        return Ok(None);
    }
    let id = &record.context["lane"]["currentId"];
    let scope = id["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("history lane scope"))?;
    let name = id["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("history lane name"))?;
    let path = crate::scope_path(&record.request.root)
        .join("refs/remotes")
        .join(scope)
        .join(name);
    let Some(bytes) = proof::read(&path, &mut record.proofs)? else { return Ok(None) };
    let rows: Vec<Value> = crate::parse_jsonc(&bytes)
        .and_then(|val| serde_json::from_value(val).map_err(io::Error::other))?;
    if rows.len() > 4096 {
        return Err(invalid("history remote lane component budget"));
    }
    for row in rows {
        if matches_row_identity(&row["id"], identity) {
            let head = row["head"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("history remote lane head"))?;
            crate::merge_history::hash(head)?;
            return Ok(Some(head.to_owned()));
        }
    }
    Ok(None)
}
pub(in crate::workspace::engine::command) fn local<'a>(
    context: &'a Value,
    identity: &str,
    model: &'a Value,
) -> Option<&'a str> {
    context["lane"]["current"]["value"]["components"]
        .as_array()?
        .iter()
        .find(|row| matches_row_identity(&row["id"], identity))
        .and_then(|row| {
            row["head"]
                .as_str()
                .map(str::trim)
                .filter(|head| !head.is_empty())
        })
        .or_else(|| {
            model["head"]
                .as_str()
                .map(str::trim)
                .filter(|head| !head.is_empty())
        })
}

fn matches_row_identity(id_value: &Value, identity: &str) -> bool {
    let identity = identity.trim();
    if crate::command_import::lane::component_identity(id_value).ok().as_deref() == Some(identity) {
        return true;
    }
    let Some((scope, name)) = identity.split_once('/') else {
        return false;
    };
    if let Some(raw_id) = id_value.as_str().map(str::trim) {
        return raw_id == identity || raw_id == name;
    }
    let row_scope = id_value["scope"].as_str().map_or("", str::trim);
    id_value["name"].as_str().map(str::trim) == Some(name)
        && (row_scope == scope || row_scope.is_empty())
}

pub(in crate::workspace::engine::command) fn source<'a>(
    options: &super::super::input::Options,
    context: &'a Value,
    identity: &str,
    model: &'a Value,
) -> Option<&'a str> {
    if super::phase(options).is_some() {
        local(context, identity, model)
    } else {
        model["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
    }
}
