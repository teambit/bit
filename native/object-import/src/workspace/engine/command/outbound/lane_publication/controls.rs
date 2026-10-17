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
    if header["id"]["name"] != name
        || header["id"]["scope"] != scope
        || header
            .get("exported")
            .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("outbound lane bitmap identity"));
    }
    let mut changed = header["exported"] != true;
    header["exported"] = Value::Bool(true);
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("outbound lane bitmap components"))?;
    for component in components {
        let component_scope = component["id"]["scope"]
            .as_str()
            .ok_or_else(|| invalid("outbound lane bitmap scope"))?;
        let component_name =
            component["id"]["name"].as_str().ok_or_else(|| invalid("outbound lane bitmap name"))?;
        if let Some(row) = bitmap.get_mut(component_name)
            && row["scope"] == ""
        {
            row["scope"] = Value::String(component_scope.to_owned());
            row.as_object_mut()
                .ok_or_else(|| invalid("outbound lane bitmap row"))?
                .remove("defaultScope");
            changed = true;
        }
    }
    if changed { crate::inspection::render_bitmap(&bitmap) } else { Ok(before.to_vec()) }
}

pub(super) fn export_scope(before: &[u8], name: &str) -> io::Result<Vec<u8>> {
    let mut scope: Value = serde_json::from_slice(before)?;
    let new =
        scope["lanes"]["new"].as_array_mut().ok_or_else(|| invalid("outbound lane scope state"))?;
    if new.len() > 4096 {
        return Err(invalid("outbound lane scope bounds"));
    }
    new.retain(|entry| entry != name);
    let mut output = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut serializer = serde_json::Serializer::with_formatter(&mut output, formatter);
    serde::Serialize::serialize(&scope, &mut serializer)?;
    Ok(output)
}

pub(super) fn export_staged_config(
    before: &[u8],
    expected_ids: &HashSet<String>,
) -> io::Result<Vec<u8>> {
    let mut rows: Vec<Value> = serde_json::from_slice(before)?;
    if rows.len() > 4096 {
        return Err(invalid("outbound lane staged configuration bounds"));
    }
    let old_len = rows.len();
    rows.retain(|row| {
        let (Some(scope), Some(name)) = (row["id"]["scope"].as_str(), row["id"]["name"].as_str())
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
