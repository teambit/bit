//! Bare-scope `Lanes.removeLanes`: trash Lane objects and unindex them.

use super::{
    Basis, Plan, ScopeGuard, Selection, hash, invalid, object_path, read_index, readset::Readset,
    remove_index_refs, unique,
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn prepare(scope: &Path, ids: &[String], force: bool) -> io::Result<Plan> {
    let guard = ScopeGuard::prepare(scope)?;
    let mut readset = Readset::new(scope);
    let (before_index, mut index) = read_index(scope)?;
    let (refs, removed) = select_lanes(scope, ids, force, &index, &mut readset)?;
    let refs = unique(refs);
    remove_index_refs(&mut index, &refs)?;
    Ok(Plan {
        scope: scope.into(),
        before_index,
        index,
        refs,
        selected: Selection { removed, missing: Vec::new(), dependent: json!({}) },
        unmerged: None,
        lanes: true,
        basis: Basis { guard, readset },
    })
}

fn select_lanes(
    scope: &Path,
    ids: &[String],
    force: bool,
    index: &Value,
    readset: &mut Readset,
) -> io::Result<(Vec<String>, Vec<String>)> {
    let mut refs = Vec::new();
    let mut removed = Vec::new();
    for id in ids {
        let (lane_scope, name) = id.split_once('/').ok_or_else(|| invalid("remote lane id"))?;
        if name == "main" {
            return Err(invalid(r#"unable to remove the default lane "main""#));
        }
        let row = index["lanes"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| super::row_id_parts(&row["id"]) == (lane_scope, name))
            })
            .ok_or_else(|| invalid("remote lane not found"))?;
        let lane_hash = hash(&row["hash"])?;
        let lane = readset.read(lane_hash, "Lane")?;
        if lane["scope"] != lane_scope || lane["name"] != name {
            return Err(invalid("remote lane identity"));
        }
        if !force && !fully_merged(index, readset, &lane)? {
            return Err(invalid(&format!(
                "unable to remove {name} lane, it is not fully merged. to disregard this error, please use --force flag",
            )));
        }
        refs.push(lane_hash.to_owned());
        readset.watch(&object_path(&scope.join("trash"), lane_hash))?;
        removed.push(id.to_owned());
    }
    Ok((refs, removed))
}

fn fully_merged(index: &Value, readset: &mut Readset, lane: &Value) -> io::Result<bool> {
    let Some(rows) = lane["components"].as_array() else { return Err(invalid("lane components")) };
    for row in rows {
        if !component_merged(index, readset, row)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn component_merged(index: &Value, readset: &mut Readset, row: &Value) -> io::Result<bool> {
    let (component_scope, name) = super::row_id_parts(&row["id"]);
    let Some(head) = row["head"].as_str() else {
        return Err(invalid("lane member"));
    };
    if component_scope.is_empty() || name.is_empty() {
        return Err(invalid("lane member"));
    }
    let model = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .and_then(|items| {
            items
                .iter()
                .find(|item| {
                    let (item_scope, item_name) = super::row_id_parts(&item["id"]);
                    item["isSymlink"] != true
                        && (item_scope == component_scope || item_scope.is_empty())
                        && item_name == name
                })
        });
    let Some(model) = model else { return Ok(false) };
    let component = readset.read(hash(&model["hash"])?, "Component")?;
    contains_head(readset, component["head"].as_str(), head)
}

fn contains_head(readset: &mut Readset, main: Option<&str>, head: &str) -> io::Result<bool> {
    let mut pending = main
        .map(str::to_owned)
        .into_iter()
        .collect::<Vec<_>>();
    let mut visited = std::collections::HashSet::new();
    while let Some(current) = pending.pop() {
        if current == head {
            return Ok(true);
        }
        if !visited.insert(current.clone()) {
            continue;
        }
        let version = readset.read(&current, "Version")?;
        pending.extend(
            version["parents"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_owned),
        );
    }
    Ok(false)
}
