//! Lane header, visibility, and tracked target reconciliation ([`on_lane`], [`tracked_checkout`], [`switch_visibility`], [`promote_inactive_scope`]) for `.bitmap` updates.

use super::{super::repository, Update, identity, invalid};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

/// Returns whether the workspace `context` is currently checked out on a non-`main` lane (`context.lane.currentId.name`).
#[inline]
pub(super) fn on_lane(context: &Value) -> bool {
    context["lane"]["currentId"]["name"]
        .as_str()
        .map(str::trim)
        .is_some_and(|name| !name.is_empty() && name != "main")
}

/// Checkout rewrites already tracked lane rows without changing their visibility.
pub(super) fn tracked_checkout(context: &Value, component: &str) -> bool {
    let component = component.trim();
    context["lane"]["trackedTargets"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| row["identity"].as_str().map(str::trim) == Some(component))
        })
        && !context["lane"]["inactiveTargets"]
            .as_array()
            .is_some_and(|rows| {
                rows.iter()
                    .any(|row| row["identity"].as_str().map(str::trim) == Some(component))
            })
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
        let (available, lane_only) = switch_flags(context, &component, name, lane_only)?;
        let fields = entry.as_object_mut().ok_or_else(|| invalid("switch bitmap entry"))?;
        fields.shift_remove("isAvailableOnCurrentLane");
        fields.shift_remove("onLanesOnly");
        if lane_only {
            fields.insert("onLanesOnly".into(), Value::Bool(true));
        }
        if !available || lane_only {
            fields.insert("isAvailableOnCurrentLane".into(), Value::Bool(available));
        }
    }
    Ok(())
}
/// Computes `(is_available_on_current_lane, on_lanes_only)` flags for `component` when switching to lane `name`.
fn switch_flags(
    context: &Value,
    component: &str,
    name: &str,
    lane_only: &[Value],
) -> io::Result<(bool, bool)> {
    let component = component.trim();
    let has_main_head = name == "main"
        && repository::model(context, component)?
            .is_some_and(|model| {
                model["head"]
                    .as_str()
                    .is_some_and(|head| !head.trim().is_empty())
            });
    let was_lane_only = !has_main_head
        && lane_only
            .iter()
            .any(|value| value.as_str().map(str::trim) == Some(component));
    let on_destination = was_lane_only
        && name != "main"
        && context["lane"]["switchLaneHeads"].get(component).is_some();
    let available = context["lane"]["switchSelectedIds"]
        .as_array()
        .map_or(!was_lane_only || on_destination, |ids| {
            ids.iter()
                .any(|id| id.as_str().map(str::trim) == Some(component))
        });
    let lane_only = on_destination && (context["lane"]["switchWorkspaceOnly"] != true || available);
    Ok((available, lane_only))
}

/// `Consumer.getNotExportedIds` considers only the current lane's available bitmap
/// IDs. The writer therefore loads an inactive unscoped entry as a scoped ID.
pub(super) fn promote_inactive_scope(
    entry: &mut Value,
    context: &Value,
    update: &Update,
) -> io::Result<()> {
    if context.get("lane").is_some()
        && entry["isAvailableOnCurrentLane"] == false
        && entry["scope"]
            .as_str()
            .is_some_and(|scope| scope.trim().is_empty())
    {
        let (scope, _) = update.identity
            .split_once('/')
            .map(|(scope, rest)| (scope.trim(), rest))
            .filter(|(scope, _)| !scope.is_empty())
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
    let (scope, name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(header)
            .unwrap_or_default();
    if !on_lane(context)
        || scope.is_empty()
        || scope != context["lane"]["currentId"]["scope"].as_str().unwrap_or_default()
        || name != context["lane"]["currentId"]["name"].as_str().unwrap_or_default()
        || header
            .get("exported")
            .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("command lane bitmap header mismatch"));
    }
    // LaneId's enumerable instance fields are name then scope; getContent adds exported last.
    Ok(Some(json!({"id":{"name":name,"scope":scope},
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
    let mut kept = Vec::with_capacity(rows.len());
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
    let addition = [context["lane"]["additions"].as_array(), context["scopeAdditions"].as_array()]
        .into_iter()
        .flatten()
        .flatten()
        .find(|row| identity(row).is_ok_and(|id| id == update.identity))
        .ok_or_else(|| invalid("command bitmap missing prepared addition"))?;
    validate_addition(addition, rows)?;
    Ok(addition)
}

fn validate_addition(addition: &Value, rows: &[Value]) -> io::Result<()> {
    let directory = addition["rootDir"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("command bitmap addition root"))?;
    crate::checkout::plan::relative_path(directory)?;
    if directory == "."
        || addition["scope"]
            .as_str()
            .is_none_or(|scope| scope.trim().is_empty())
    {
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

pub(super) fn validate_roots(directory: &str, rows: &[Value]) -> io::Result<()> {
    for row in rows {
        if row["isAvailableOnCurrentLane"] == false
            || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        {
            continue;
        }
        let other = row["rootDir"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("command bitmap existing root"))?;
        if other != "."
            && (directory == other
                || directory
                    .strip_prefix(other)
                    .is_some_and(|rest| rest.starts_with('/'))
                || other
                    .strip_prefix(directory)
                    .is_some_and(|rest| rest.starts_with('/')))
        {
            return Err(invalid("command bitmap addition overlaps tracked root"));
        }
    }
    Ok(())
}

pub(super) fn make_available_on_main(entries: &mut [Value], context: &Value) -> io::Result<bool> {
    let mut changed = false;
    for entry in entries {
        if entry["isAvailableOnCurrentLane"] != false
            || crate::workspace::engine::client_status::config::is_config_removed(&entry["config"])
        {
            continue;
        }
        let id = identity(entry)?;
        if repository::model(context, &id)?
            .is_some_and(|model| {
                model["head"]
                    .as_str()
                    .is_some_and(|head| !head.trim().is_empty())
            })
        {
            let fields = entry.as_object_mut().ok_or_else(|| invalid("command bitmap entry"))?;
            fields.shift_remove("isAvailableOnCurrentLane");
            fields.shift_remove("onLanesOnly");
            changed = true;
        }
    }
    Ok(changed)
}
