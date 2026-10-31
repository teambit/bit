//! Canonical post-export bitmap, lane marker and staged configuration edits.
use super::invalid;
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn export_bitmap(
    before: &[u8],
    scope: &str,
    name: &str,
    lane: &Value,
) -> io::Result<Vec<u8>> {
    let mut bitmap = crate::recovery::jsonc::parse(before)?;
    let header =
        bitmap.get_mut("_bit_lane").ok_or_else(|| invalid("outbound lane bitmap header"))?;
    if !crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
        header, scope, name,
    ) || header
        .get("exported")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("outbound lane bitmap identity"));
    }
    let mut changed = header["exported"] != true;
    header["exported"] = Value::Bool(true);
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("outbound lane bitmap components"))?;
    let rows = bitmap.as_object_mut().ok_or_else(|| invalid("outbound lane bitmap"))?;
    for component in components {
        let (component_scope, component_name) =
            crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(
                component,
            )
            .ok_or_else(|| invalid("outbound lane bitmap id"))?;
        if let Some(row) = unexported_lane_row(rows, component_scope, component_name) {
            row["scope"] = Value::String(component_scope.to_owned());
            row.as_object_mut()
                .ok_or_else(|| invalid("outbound lane bitmap row"))?
                .remove("defaultScope");
            changed = true;
        }
    }
    if changed { crate::inspection::render_bitmap(&bitmap) } else { Ok(before.to_vec()) }
}

fn unexported_lane_row<'a>(
    rows: &'a mut serde_json::Map<String, Value>,
    scope: &str,
    name: &str,
) -> Option<&'a mut Value> {
    let full = format!("{scope}/{name}");
    rows.iter_mut()
        .find(|(key, row)| {
            if key.starts_with('$')
                || matches!(key.as_str(), "_bit_lane" | "version")
                || !row.is_object()
            {
                return false;
            }
            let key_id = key.rsplit_once('@').map_or(key.as_str(), |(bare, _)| bare);
            let default_scope = row["defaultScope"].as_str().unwrap_or_default();
            (key_id == name || key_id == full || row["name"] == name)
                && row["scope"]
                    .as_str()
                    .unwrap_or_default()
                    .is_empty()
                && (default_scope.is_empty() || default_scope == scope)
        })
        .map(|(_, row)| row)
}

pub(super) fn export_scope(before: &[u8], name: &str) -> io::Result<Vec<u8>> {
    let mut scope: Value = crate::parse_jsonc(before)?;
    let new =
        scope["lanes"]["new"].as_array_mut().ok_or_else(|| invalid("outbound lane scope state"))?;
    if new.len() > 4096 {
        return Err(invalid("outbound lane scope bounds"));
    }
    new.retain(|entry| entry != name);
    bit_workspace_config::render_scope_json(&scope)
}

pub(super) fn export_staged_config(
    before: &[u8],
    expected_ids: &HashSet<String>,
) -> io::Result<Vec<u8>> {
    let mut rows: Vec<Value> = crate::parse_jsonc(before)
        .and_then(|val| serde_json::from_value(val).map_err(io::Error::other))?;
    if rows.len() > 4096 {
        return Err(invalid("outbound lane staged configuration bounds"));
    }
    let old_len = rows.len();
    rows.retain(|row| {
        let Some((scope, name)) =
            crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(row)
        else {
            return true;
        };
        !expected_ids
            .iter()
            .any(|id| id.starts_with(&format!("{scope}/{name}@")))
    });
    if rows.len() == old_len {
        return Ok(before.to_vec());
    }
    serde_json::to_vec_pretty(&rows).map_err(io::Error::other)
}
