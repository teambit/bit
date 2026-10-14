use super::{super::repository, Update, identity, invalid};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

pub(super) fn on_lane(context: &Value) -> bool {
    context["lane"]["currentId"]["name"]
        .as_str()
        .is_some_and(|name| name != "main")
}

/// Switching to main clears lane-only visibility when the component has a
/// main head. Other lanes preserve the tracked lane-only designation.
pub(super) fn switch_visibility(
    entries: &mut [Value],
    context: &Value,
    name: &str,
) -> io::Result<()> {
    let lane_only = context["lane"]["switchLaneOnly"]
        .as_array()
        .ok_or_else(|| invalid("switch lane-only identities"))?;
    for entry in entries {
        let component = identity(entry)?;
        let fields = entry.as_object_mut().ok_or_else(|| invalid("switch bitmap entry"))?;
        fields.shift_remove("isAvailableOnCurrentLane");
        fields.shift_remove("onLanesOnly");
        let has_main_head = name == "main"
            && repository::model(context, &component)?
                .is_some_and(|model| model["head"].as_str().is_some());
        if has_main_head
            || !lane_only
                .iter()
                .any(|value| value == &component)
        {
            continue;
        }
        let on_destination =
            name != "main" && context["lane"]["switchLaneHeads"].get(&component).is_some();
        if on_destination {
            fields.insert("onLanesOnly".into(), Value::Bool(true));
            fields.insert("isAvailableOnCurrentLane".into(), Value::Bool(true));
        } else {
            fields.insert("isAvailableOnCurrentLane".into(), Value::Bool(false));
        }
    }
    Ok(())
}

// Consumer.getNotExportedIds considers only the current lane's available bitmap
// IDs. The writer therefore loads an inactive unscoped entry as a scoped ID.
pub(super) fn promote_inactive_scope(
    entry: &mut Value,
    context: &Value,
    update: &Update,
) -> io::Result<()> {
    if context.get("lane").is_some()
        && entry["isAvailableOnCurrentLane"] == false
        && entry["scope"] == ""
    {
        let (scope, _) = update.identity
            .split_once('/')
            .ok_or_else(|| invalid("command bitmap promoted scope"))?;
        entry["scope"] = json!(scope);
    }
    Ok(())
}

pub(super) fn header(context: &Value, bitmap: &Value) -> io::Result<Option<Value>> {
    let Some(header) = bitmap.get("_bit_lane") else {
        if on_lane(context) {
            return Err(invalid("command lane bitmap header missing"));
        }
        return Ok(None);
    };
    if !on_lane(context)
        || header["id"]["scope"].as_str().is_none_or(str::is_empty)
        || header["id"]["scope"] != context["lane"]["currentId"]["scope"]
        || header["id"]["name"] != context["lane"]["currentId"]["name"]
        || header
            .get("exported")
            .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("command lane bitmap header mismatch"));
    }
    // LaneId's enumerable instance fields are name then scope; getContent adds exported last.
    Ok(Some(json!({"id":{"name":header["id"]["name"],"scope":header["id"]["scope"]},
        "exported":header["exported"].as_bool().unwrap_or(false)})))
}

pub(super) fn membership(
    rows: &mut Vec<Value>,
    context: &Value,
    updates: &[Update],
    removed: &[String],
) -> io::Result<bool> {
    let removed_set = removal_selection(context, updates, removed)?;
    let mut changed = false;
    let mut kept = Vec::new();
    for row in rows.drain(..) {
        if removed_set.contains(&identity(&row)?) {
            changed = true;
        } else {
            kept.push(row);
        }
    }
    *rows = kept;
    for update in updates {
        if rows
            .iter()
            .any(|row| identity(row).is_ok_and(|id| id == update.identity))
        {
            continue;
        }
        let addition = prepared_addition(context, update, rows)?;
        rows.push(addition.clone());
        changed = true;
    }
    Ok(changed)
}

fn removal_selection<'a>(
    context: &Value,
    updates: &[Update],
    removed: &'a [String],
) -> io::Result<HashSet<&'a String>> {
    let removed_set = removed.iter().collect::<HashSet<_>>();
    if removed.len() > 4096
        || removed_set.len() != removed.len()
        || updates
            .iter()
            .any(|update| removed_set.contains(&update.identity))
        || !removed.is_empty() && context.get("lane").is_none()
    {
        return Err(invalid("command bitmap removal selection"));
    }
    Ok(removed_set)
}

fn prepared_addition<'a>(
    context: &'a Value,
    update: &Update,
    rows: &[Value],
) -> io::Result<&'a Value> {
    if update.keep_ours {
        return Err(invalid("command bitmap cannot preserve an absent component"));
    }
    let addition = context["lane"]["additions"]
        .as_array()
        .and_then(|entries| {
            entries
                .iter()
                .find(|row| identity(row).is_ok_and(|id| id == update.identity))
        })
        .ok_or_else(|| invalid("command bitmap missing prepared addition"))?;
    validate_addition(addition, rows)?;
    Ok(addition)
}

fn validate_addition(addition: &Value, rows: &[Value]) -> io::Result<()> {
    let directory =
        addition["rootDir"].as_str().ok_or_else(|| invalid("command bitmap addition root"))?;
    crate::checkout::plan::relative_path(directory)?;
    if directory == "." || addition["scope"].as_str().is_none_or(str::is_empty) {
        return Err(invalid("command bitmap addition scope or root"));
    }
    let fields = addition.as_object().ok_or_else(|| invalid("command bitmap addition"))?;
    if fields
        .keys()
        .any(|key| !matches!(key.as_str(), "name" | "scope" | "version" | "mainFile" | "rootDir"))
    {
        return Err(invalid("command bitmap addition callbacks"));
    }
    validate_roots(directory, rows)
}

fn validate_roots(directory: &str, rows: &[Value]) -> io::Result<()> {
    for row in rows {
        if row["isAvailableOnCurrentLane"] == false
            || row["config"]["teambit.component/remove"]["removed"] == true
        {
            continue;
        }
        let other =
            row["rootDir"].as_str().ok_or_else(|| invalid("command bitmap existing root"))?;
        if other != "."
            && (directory == other
                || directory.starts_with(&format!("{other}/"))
                || other.starts_with(&format!("{directory}/")))
        {
            return Err(invalid("command bitmap addition overlaps tracked root"));
        }
    }
    Ok(())
}
