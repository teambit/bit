//! Select every tracked lane/main component via [`lane_entries`] and its complete `Version` ancestry.

use super::{ComponentId, Loaded, MAX_OBJECTS, Prepare, invalid, model};
use serde_json::{Value, json};
use std::{collections::HashSet, fs, io, path::Path};

/// Combines explicit `components` and parsed `updateDependents` entries from `lane`.
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
    entries.reserve(updates.len());
    for update in updates {
        entries.push(parse_update_dependent(update)?);
    }
    Ok(entries)
}

/// Parses a single `updateDependents` entry (`scope/name@head` string or object) into a normalized lane row.
#[inline]
fn parse_update_dependent(update: &Value) -> io::Result<Value> {
    if let Some(raw) = update.as_str() {
        let (identity, head) = raw
            .trim()
            .rsplit_once('@')
            .ok_or_else(|| invalid("outbound lane update-dependent id"))?;
        let (scope, name) = identity
            .trim()
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .ok_or_else(|| invalid("outbound lane update-dependent identity"))?;
        let trimmed_head = head.trim();
        crate::merge_history::hash(trimmed_head)?;
        if scope.is_empty() || name.is_empty() {
            return Err(invalid("outbound lane update-dependent identity"));
        }
        return Ok(json!({"id":{"scope":scope,"name":name},"head":trimmed_head}));
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
        let Some(identity) = workspace_entry_id(key, entry) else {
            continue;
        };
        if let Some(item) = resolve_workspace_entry(&loaded.dir, indexed, lane_rows, identity)? {
            extra.push(item);
        }
    }
    Ok(extra)
}

fn resolve_workspace_entry(
    dir: &Path,
    indexed: &[Value],
    lane_rows: &[Value],
    (scope, name): (&str, &str),
) -> io::Result<Option<Value>> {
    use crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches;
    if lane_rows.iter().any(|row| row_lane_matches(row, scope, name)) {
        return Ok(None);
    }
    let row = indexed
        .iter()
        .find(|row| row["isSymlink"] != true && row_lane_matches(row, scope, name))
        .ok_or_else(|| invalid("outbound non-staged component model missing"))?;
    let hash = row["hash"]
        .as_str()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid("outbound model hash"))?;
    let component = model::read_object(dir, hash, "Component")?;
    Ok(component["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty())
        .map(|head| json!({"id":{"scope":scope,"name":name},"head":head})))
}

fn workspace_entry_id<'a>(key: &'a str, entry: &'a Value) -> Option<(&'a str, &'a str)> {
    let trimmed_key = key.trim();
    if trimmed_key.starts_with('$')
        || matches!(trimmed_key, "_bit_lane" | "version")
        || !entry.is_object()
        || entry["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&entry["config"])
    {
        return None;
    }
    let key_id = trimmed_key.rsplit_once('@').map_or(trimmed_key, |(bare, _)| bare.trim());
    let scope = non_empty_field(entry, "scope")
        .or_else(|| non_empty_field(entry, "defaultScope"))
        .or_else(|| {
            key_id
                .split_once('/')
                .map(|(scope_part, _)| scope_part.trim())
                .filter(|scope_part| !scope_part.is_empty())
        })?;
    let name = non_empty_field(entry, "name")
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(scope)
                .and_then(|rest| rest.strip_prefix('/'))
                .unwrap_or(key_id)
                .trim()
        });
    non_empty_field(entry, "version")
        .or_else(|| {
            trimmed_key
                .rsplit_once('@')
                .map(|(_, ver)| ver.trim())
                .filter(|val| !val.is_empty())
        })?;
    (!name.is_empty()).then_some((scope, name))
}

#[inline]
fn non_empty_field<'a>(entry: &'a Value, field: &str) -> Option<&'a str> {
    entry[field]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
}

/// `getAllVersionHashes` starts at the lane head and walks its complete
/// ancestry; `addMainHeadIfPossible` adds an independently present main head.
pub(super) fn all_lane_versions(
    dir: &Path,
    head: &str,
    main_head: Option<&str>,
) -> io::Result<Vec<String>> {
    let mut output = Vec::new();
    let mut pending = vec![head.trim().to_owned()];
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
            let parent = parent
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("outbound lane parent"))?;
            crate::merge_history::hash(parent)?;
            pending.push(parent.to_owned());
        }
        output.push(hash);
    }
    output.reverse();
    append_main_head(dir, main_head, &seen, &mut output)?;
    Ok(output)
}

#[inline]
fn append_main_head(
    dir: &Path,
    main_head: Option<&str>,
    seen: &HashSet<String>,
    output: &mut Vec<String>,
) -> io::Result<()> {
    if let Some(main) = main_head
        .map(str::trim)
        .filter(|main| !main.is_empty() && !seen.contains(*main))
    {
        crate::merge_history::hash(main)?;
        if dir
            .join(&main[..2])
            .join(&main[2..])
            .exists()
        {
            output.push(main.to_owned());
        }
    }
    Ok(())
}
