//! Validate a bitmap row before native local removal.

use super::{RowKind, invalid, valid_name, valid_scope};
use serde_json::Value;
use std::io;

pub(super) fn supported_row<'a>(
    key: &str,
    row: &'a Value,
    kind: RowKind,
) -> io::Result<(&'a str, &'a str)> {
    let name = row["name"].as_str().ok_or_else(|| invalid("component name"))?;
    let scope = row[if kind == RowKind::Imported { "scope" } else { "defaultScope" }]
        .as_str()
        .ok_or_else(|| invalid("component scope"))?;
    let identity = key == name && valid_name(name) && valid_scope(scope);
    let local = if kind == RowKind::Imported {
        row["scope"] == scope && row.get("defaultScope").is_none()
    } else {
        row["scope"].as_str().is_some_and(str::is_empty)
    };
    let version = row["version"].as_str();
    let supported = if kind == RowKind::New {
        version == Some("")
    } else {
        version.is_some_and(|value| !value.is_empty())
    };
    if !identity || !local || !supported || !supported_row_shape(row, kind) {
        return Err(invalid("component is outside the supported local state"));
    }
    Ok((name, scope))
}

fn supported_row_shape(row: &Value, kind: RowKind) -> bool {
    let allowed = [
        "name",
        "scope",
        "version",
        "defaultScope",
        "mainFile",
        "rootDir",
        "onLanesOnly",
        "isAvailableOnCurrentLane",
    ];
    let shape = row
        .as_object()
        .is_some_and(|fields| {
            fields
                .keys()
                .all(|field| allowed.contains(&field.as_str()))
        });
    let lane_fields = if kind == RowKind::LaneSnap {
        row["onLanesOnly"] == true && row["isAvailableOnCurrentLane"] == true
    } else {
        row.get("onLanesOnly").is_none() && row.get("isAvailableOnCurrentLane").is_none()
    };
    shape && lane_fields
}
