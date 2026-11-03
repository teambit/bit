//! Visible and hidden lane membership projection ([`hidden_head`], [`project`], [`project_hidden`], [`matches_component_row`], [`Selection`]) sharing selection without workspace `.bitmap` writes.
use super::{Selection, invalid};
use serde_json::Value;
use std::io;

/// Extracts the hidden `updateDependents` hash for `identity` from `lane` when present.
pub(super) fn hidden_head(lane: &Value, identity: &str) -> io::Result<Option<String>> {
    let Some(rows) = lane.get("updateDependents").and_then(Value::as_array) else {
        return Ok(None);
    };
    let mut found = None;
    for row in rows {
        let (id, hash) = row
            .as_str()
            .map(str::trim)
            .and_then(|row| row.rsplit_once('@'))
            .map(|(id, hash)| (id.trim(), hash.trim()))
            .filter(|(id, _)| !id.is_empty())
            .ok_or_else(|| invalid("lane reset hidden identity"))?;
        if id == identity {
            crate::merge_history::hash(hash)?;
            if found.replace(hash).is_some() {
                return Err(invalid("lane reset duplicate hidden identity"));
            }
        }
    }
    Ok(found.map(str::to_owned))
}

/// Updates or removes the component or `updateDependents` entry for `(scope, name)` on `lane`.
pub(super) fn project(
    lane: &mut Value,
    scope: &str,
    name: &str,
    selection: &Selection,
) -> io::Result<()> {
    let rows = lane["components"].as_array_mut().ok_or_else(|| invalid("lane reset components"))?;
    let mut positions = rows
        .iter()
        .enumerate()
        .filter_map(|(index, row)| matches_component_row(&row["id"], scope, name).then_some(index));
    if let Some(position) = positions.next() {
        if positions.next().is_some() {
            return Err(invalid("lane reset duplicate component"));
        }
        if selection.keep_lane {
            rows[position]["head"] =
                Value::String(selection.next.clone().ok_or_else(|| invalid("lane reset next"))?);
        } else {
            rows.remove(position);
        }
        return Ok(());
    }
    project_hidden(lane, &format!("{scope}/{name}"), selection)
}

/// Returns `true` when `Lane` component `id` matches `(scope, name)`.
#[inline]
#[must_use]
fn matches_component_row(id: &Value, scope: &str, name: &str) -> bool {
    let (row_scope, row_name) = super::row_id_parts(id);
    (row_scope == scope || row_scope.is_empty()) && row_name == name
}

/// Updates or removes `identity` in `lane["updateDependents"]` according to `selection`.
fn project_hidden(lane: &mut Value, identity: &str, selection: &Selection) -> io::Result<()> {
    let rows =
        lane["updateDependents"].as_array_mut().ok_or_else(|| invalid("lane reset hidden rows"))?;
    let mut positions = rows
        .iter()
        .enumerate()
        .filter_map(|(index, row)| {
            row.as_str()
                .map(str::trim)
                .and_then(|row| row.rsplit_once('@'))
                .is_some_and(|(id, _)| id.trim() == identity)
                .then_some(index)
        });
    let position = positions.next().ok_or_else(|| invalid("lane reset hidden absent"))?;
    if positions.next().is_some() {
        return Err(invalid("lane reset duplicate hidden identity"));
    }
    if selection.keep_lane {
        rows[position] = Value::String(format!(
            "{identity}@{}",
            selection.next.as_deref().ok_or_else(|| invalid("lane reset hidden next"))?,
        ));
    } else {
        rows.remove(position);
    }
    if rows.is_empty() {
        lane.as_object_mut()
            .ok_or_else(|| invalid("lane reset Lane"))?
            .shift_remove("updateDependents");
    }
    Ok(())
}
