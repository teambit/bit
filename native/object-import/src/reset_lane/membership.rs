//! Visible and hidden lane membership share selection but not workspace bitmap writes.
use super::{Selection, invalid};
use serde_json::Value;
use std::io;

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
            .ok_or_else(|| invalid("lane reset hidden identity"))?;
        if id == identity {
            crate::merge_history::hash(hash)?;
            if found.replace(hash.to_owned()).is_some() {
                return Err(invalid("lane reset duplicate hidden identity"));
            }
        }
    }
    Ok(found)
}

pub(super) fn project(
    lane: &mut Value,
    scope: &str,
    name: &str,
    selection: &Selection,
) -> io::Result<()> {
    let identity = format!("{scope}/{name}");
    let rows = lane["components"].as_array_mut().ok_or_else(|| invalid("lane reset components"))?;
    if let Some(position) = rows
        .iter()
        .position(|row| matches_component_row(&row["id"], scope, name))
    {
        if selection.keep_lane {
            rows[position]["head"] =
                Value::String(selection.next.clone().ok_or_else(|| invalid("lane reset next"))?);
        } else {
            rows.remove(position);
        }
        return Ok(());
    }
    project_hidden(lane, &identity, selection)
}

fn matches_component_row(id: &Value, scope: &str, name: &str) -> bool {
    let (row_scope, row_name) = super::row_id_parts(id);
    (row_scope == scope || row_scope.is_empty()) && row_name == name
}

fn project_hidden(lane: &mut Value, identity: &str, selection: &Selection) -> io::Result<()> {
    let rows =
        lane["updateDependents"].as_array_mut().ok_or_else(|| invalid("lane reset hidden rows"))?;
    let position = rows
        .iter()
        .position(|row| {
            row.as_str()
                .and_then(|row| row.rsplit_once('@'))
                .is_some_and(|(id, _)| id == identity)
        })
        .ok_or_else(|| invalid("lane reset hidden absent"))?;
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
