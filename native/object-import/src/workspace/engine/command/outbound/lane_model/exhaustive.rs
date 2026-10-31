//! Select every tracked lane/main component and its complete Version ancestry.
use super::{ComponentId, Loaded, MAX_OBJECTS, Prepare, invalid, model};
use serde_json::{Value, json};
use std::{collections::HashSet, fs, io, path::Path};

pub(in super::super) fn lane_entries(lane: &Value) -> io::Result<Vec<Value>> {
    let mut entries = lane["components"]
        .as_array()
        .ok_or_else(|| invalid("outbound lane components"))?
        .clone();
    let updates = match lane.get("updateDependents") {
        None | Some(Value::Null) => &[][..],
        Some(Value::Array(updates)) => updates.as_slice(),
        Some(_) => return Err(invalid("outbound lane update-dependents")),
    };
    for update in updates {
        entries.push(parse_update_dependent(update)?);
    }
    Ok(entries)
}

fn parse_update_dependent(update: &Value) -> io::Result<Value> {
    if let Some(raw) = update.as_str() {
        let (identity, head) =
            raw.rsplit_once('@').ok_or_else(|| invalid("outbound lane update-dependent id"))?;
        let (scope, name) = identity
            .split_once('/')
            .ok_or_else(|| invalid("outbound lane update-dependent identity"))?;
        crate::merge_history::hash(head)?;
        if scope.is_empty() || name.is_empty() {
            return Err(invalid("outbound lane update-dependent identity"));
        }
        return Ok(json!({"id":{"scope":scope,"name":name},"head":head}));
    }
    let parsed = ComponentId::parse(update)?;
    Ok(json!({"id":{"scope":parsed.scope,"name":parsed.name},"head":parsed.head}))
}

/// `listNonNewComponentsIds()` also selects tracked main components absent
/// from the Lane object when `ExportCmd` includes non-staged versions.
pub(super) fn workspace_entries(
    input: &Prepare,
    loaded: &Loaded,
    lane_rows: &[Value],
) -> io::Result<Vec<Value>> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(input.root.join(".bitmap"))?)?;
    let entries = bitmap.as_object().ok_or_else(|| invalid("outbound lane bitmap"))?;
    let indexed = loaded.index["components"]
        .as_array()
        .or_else(|| loaded.index.as_array())
        .ok_or_else(|| invalid("outbound component index"))?;
    let mut extra = Vec::new();
    for (key, entry) in entries {
        let Some(id) = workspace_entry_id(key, entry) else {
            continue;
        };
        if lane_rows
            .iter()
            .any(|row| row["id"] == id)
        {
            continue;
        }
        let row = indexed
            .iter()
            .find(|row| row["isSymlink"] != true && row["id"] == id)
            .ok_or_else(|| invalid("outbound non-staged component model missing"))?;
        let hash = row["hash"].as_str().ok_or_else(|| invalid("outbound model hash"))?;
        let component = model::read_object(&loaded.dir, hash, "Component")?;
        let Some(head) = component["head"].as_str() else { continue };
        extra.push(json!({"id":id,"head":head}));
    }
    Ok(extra)
}

fn workspace_entry_id(key: &str, entry: &Value) -> Option<Value> {
    if key.starts_with('$')
        || matches!(key, "_bit_lane" | "version")
        || !entry.is_object()
        || entry["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&entry["config"])
    {
        return None;
    }
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare);
    let scope = entry["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| {
            entry["defaultScope"]
                .as_str()
                .filter(|val| !val.is_empty())
        })
        .or_else(|| key_id.split_once('/').map(|(scope_part, _)| scope_part))?;
    let name = entry["name"]
        .as_str()
        .filter(|val| !val.is_empty())
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(&format!("{scope}/"))
                .unwrap_or(key_id)
        });
    let version = entry["version"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| {
            key.rsplit_once('@')
                .map(|(_, ver)| ver)
                .filter(|val| !val.is_empty())
        })?;
    let _ = version;
    Some(json!({"scope":scope,"name":name}))
}

/// `getAllVersionHashes` starts at the lane head and walks its complete
/// ancestry; `addMainHeadIfPossible` adds an independently present main head.
pub(super) fn all_lane_versions(
    dir: &Path,
    head: &str,
    main_head: Option<&str>,
) -> io::Result<Vec<String>> {
    let mut output = Vec::new();
    let mut pending = vec![head.to_owned()];
    let mut seen = HashSet::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) {
            continue;
        }
        if seen.len() > MAX_OBJECTS {
            return Err(invalid("outbound lane history budget"));
        }
        let version = model::read_object(dir, &hash, "Version")?;
        let parents =
            version["parents"].as_array().ok_or_else(|| invalid("outbound lane parents"))?;
        for parent in parents.iter().rev() {
            let parent = parent.as_str().ok_or_else(|| invalid("outbound lane parent"))?;
            crate::merge_history::hash(parent)?;
            pending.push(parent.to_owned());
        }
        output.push(hash);
    }
    output.reverse();
    if let Some(main) = main_head.filter(|main| !seen.contains(*main)) {
        crate::merge_history::hash(main)?;
        if dir
            .join(&main[..2])
            .join(&main[2..])
            .exists()
        {
            output.push(main.to_owned());
        }
    }
    Ok(output)
}
