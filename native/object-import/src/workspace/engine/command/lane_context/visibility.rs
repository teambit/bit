#[cfg(test)]
mod tests;
use super::{Id, Record, config, invalid};
use crate::command_import::{
    PreparedImport,
    lane::{Entry, entries},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

pub(in crate::workspace::engine::command) fn identity_bitmap(
    bitmap: &Value,
    settings: &Value,
) -> io::Result<Value> {
    let mut projected = bitmap.clone();
    for (key, row) in projected.as_object_mut().ok_or_else(|| invalid("command lane bitmap"))? {
        if key.starts_with('$')
            || matches!(key.as_str(), "_bit_lane" | "version")
            || !row.is_object()
        {
            continue;
        }
        let name = crate::reset_lane::bitmap::row_identity(key, row).1.to_owned();
        let unexported = row["scope"]
            .as_str()
            .unwrap_or_default()
            .is_empty();
        let missing_default = row["defaultScope"]
            .as_str()
            .unwrap_or_default()
            .is_empty();
        let missing_name = row["name"]
            .as_str()
            .unwrap_or_default()
            .is_empty();
        let object = row.as_object_mut().ok_or_else(|| invalid("command lane bitmap component"))?;
        if unexported && missing_default {
            object.insert("defaultScope".into(), settings["defaultScope"].clone());
        }
        if missing_name && !name.is_empty() {
            object.insert("name".into(), Value::String(name));
        }
    }
    Ok(projected)
}

pub(in crate::workspace::engine::command) fn targets(
    bitmap: &Value,
    settings: &Value,
) -> io::Result<Vec<Value>> {
    let mut visible = bitmap
        .as_object()
        .ok_or_else(|| invalid("command lane bitmap"))?
        .clone();
    visible.remove("_bit_lane");
    visible.retain(|key, row| key == "$schema-version" || row["isAvailableOnCurrentLane"] != false);
    for (key, row) in &mut visible {
        if key == "$schema-version" {
            continue;
        }
        clear_visibility(row)?;
    }
    config::context_bitmap_targets(&Value::Object(visible), settings)
}

/// A lane switch also selects hidden bitmap entries when the destination
/// carries them. Switching to main considers every tracked entry, then drops
/// lane-only entries without a main head after the models have been loaded.
pub(in crate::workspace::engine::command) fn switch_targets(
    bitmap: &Value,
    settings: &Value,
    main: bool,
    destination_heads: &HashSet<String>,
) -> io::Result<Vec<Value>> {
    let mut selected = bitmap
        .as_object()
        .ok_or_else(|| invalid("switch bitmap"))?
        .clone();
    selected.remove("_bit_lane");
    selected.retain(|key, row| {
        if key == "$schema-version" || row["isAvailableOnCurrentLane"] != false {
            return true;
        }
        let (scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
        let identity = scope
            .filter(|_| !name.is_empty())
            .map(|sc| format!("{sc}/{name}"));
        main || identity.is_some_and(|identity| destination_heads.contains(&identity))
    });
    for (key, row) in &mut selected {
        if key != "$schema-version" {
            clear_visibility(row)?;
        }
    }
    config::context_bitmap_targets(&Value::Object(selected), settings)
}

pub(super) fn inactive_targets(
    bitmap: &Value,
    settings: &Value,
    selected: &[Value],
) -> io::Result<Vec<Value>> {
    let mut inactive = bitmap
        .as_object()
        .ok_or_else(|| invalid("command lane bitmap"))?
        .clone();
    inactive.remove("_bit_lane");
    inactive.retain(|key, row| {
        key == "$schema-version" || row["isAvailableOnCurrentLane"] == false
    });
    for (key, row) in &mut inactive {
        if key != "$schema-version" {
            clear_visibility(row)?;
        }
    }
    Ok(config::context_bitmap_targets(&Value::Object(inactive), settings)?
        .into_iter()
        .filter(|target| {
            selected
                .iter()
                .any(|row| {
                    row["identity"] == target["identity"]
                        && row["bitmapPresent"] == true
                        && row["visible"] == false
                })
        })
        .collect())
}

pub(super) fn selected(
    imported: &mut PreparedImport,
    bitmap: &Value,
    targets: &Value,
    current: Option<&Record>,
    other: Option<&Record>,
    other_id: &Id,
    exclude_non_lane: bool,
) -> io::Result<Vec<Value>> {
    let on_current_lane = current.is_some();
    let current_entries = current
        .map(|lane| entries(&lane.value))
        .transpose()?
        .unwrap_or_default();
    let visible = targets.as_array().ok_or_else(|| invalid("command visible lane targets"))?;
    let selected = if other_id.is_main() {
        main_targets(imported, bitmap, visible, &current_entries, exclude_non_lane)?
    } else {
        entries(&other.ok_or_else(|| invalid("command incoming Lane absent"))?.value)?
    };
    selected
        .into_iter()
        .map(|entry| {
            selected_entry(imported, bitmap, visible, &current_entries, on_current_lane, &entry)
        })
        .collect()
}
fn clear_visibility(row: &mut Value) -> io::Result<()> {
    let object = row.as_object_mut().ok_or_else(|| invalid("command lane bitmap component"))?;
    for flag in ["isAvailableOnCurrentLane", "onLanesOnly"] {
        if let Some(value) = object.remove(flag)
            && !value.is_boolean()
        {
            return Err(invalid("command lane bitmap visibility"));
        }
    }
    Ok(())
}
fn selected_entry(
    imported: &mut PreparedImport,
    bitmap: &Value,
    visible: &[Value],
    entries: &[Entry],
    on_lane: bool,
    entry: &Entry,
) -> io::Result<Value> {
    let model = imported
        .lane_model(&entry.identity)?
        .ok_or_else(|| invalid("command lane component absent"))?;
    let main = model["head"].as_str();
    let current = entries
        .iter()
        .find(|row| row.identity == entry.identity);
    let current_head = history_head(current, main, on_lane);
    let visible = visible
        .iter()
        .any(|row| row["identity"] == entry.identity);
    let bitmap_present = visible || bitmap_has(bitmap, &entry.identity);
    Ok(
        json!({"identity":entry.identity,"head":entry.head,"currentHead":current_head,"mainHead":main,
        "hidden":current.is_some_and(|row| row.hidden),"incomingHidden":entry.hidden,
        "bitmapPresent":bitmap_present,"currentIdPresent":bitmap_present || current.is_some() || (!on_lane && main.is_some()),
        "visible":visible,"currentSource":current.map_or_else(|| if main.is_some() {"main"} else {"none"}, |row| if row.hidden {"hidden"} else {"visible"})}),
    )
}
fn history_head<'a>(
    current: Option<&'a Entry>,
    main: Option<&'a str>,
    on_lane: bool,
) -> Option<&'a str> {
    if on_lane { current.map(|row| row.head.as_str()) } else { main }
}

pub(super) fn effective_scope(row: &Value) -> Option<&str> {
    row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
        })
}

fn bitmap_has(bitmap: &Value, identity: &str) -> bool {
    let Some(rows) = bitmap.as_object() else {
        return false;
    };
    rows.iter()
        .any(|(key, row)| {
            if key.starts_with('$')
                || matches!(key.as_str(), "_bit_lane" | "version")
                || !row.is_object()
            {
                return false;
            }
            let (Some(scope), name) = crate::reset_lane::bitmap::row_identity(key, row) else {
                return false;
            };
            format!("{scope}/{name}") == identity
        })
}

fn main_targets(
    imported: &mut PreparedImport,
    bitmap: &Value,
    visible: &[Value],
    current: &[Entry],
    exclude_non_lane: bool,
) -> io::Result<Vec<Entry>> {
    let ids = main_identities(bitmap, visible, current, exclude_non_lane)?;
    let mut result = Vec::new();
    for (identity, hidden) in ids {
        let model =
            imported.lane_model(&identity)?.ok_or_else(|| invalid("command main model absent"))?;
        if let Some(head) = model["head"].as_str() {
            crate::merge_history::hash(head)?;
            result.push(Entry { identity, head: head.into(), hidden });
        }
    }
    Ok(result)
}
pub(super) fn main_identities(
    bitmap: &Value,
    visible: &[Value],
    current: &[Entry],
    exclude_non_lane: bool,
) -> io::Result<Vec<(String, bool)>> {
    let mut ids = current
        .iter()
        .map(|entry| (entry.identity.clone(), entry.hidden))
        .collect::<Vec<_>>();
    if !exclude_non_lane {
        for row in visible {
            let identity =
                row["identity"].as_str().ok_or_else(|| invalid("command visible identity"))?;
            if !ids.iter().any(|(id, _)| id == identity) {
                ids.push((identity.into(), false));
            }
        }
    }
    ids.retain(|(identity, _)| !unexported(bitmap, visible, identity));
    Ok(ids)
}
fn unexported(bitmap: &Value, visible: &[Value], identity: &str) -> bool {
    let Some(target) = visible
        .iter()
        .find(|row| row["identity"] == identity)
    else {
        return false;
    };
    bitmap
        .as_object()
        .is_some_and(|rows| {
            rows.values()
                .any(|row| {
                    row.is_object()
                        && row["scope"]
                            .as_str()
                            .unwrap_or_default()
                            .is_empty()
                        && row["rootDir"] == target["directory"]
                })
        })
}
