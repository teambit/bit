//! Validate a bitmap row before native local removal.

use super::{RowKind, invalid, valid_name, valid_scope};
use serde_json::Value;
use std::io;

pub(super) fn supported_row<'a>(
    key: &'a str,
    row: &'a Value,
    kind: RowKind,
) -> io::Result<(&'a str, &'a str)> {
    let scope = scope(row)?;
    let fallback_name = key
        .strip_prefix(scope)
        .and_then(|rest| rest.strip_prefix('/'))
        .unwrap_or(key);
    let name = row["name"]
        .as_str()
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_name);
    let identity =
        (key == name || key == format!("{scope}/{name}")) && valid_name(name) && valid_scope(scope);
    let local = if matches!(kind, RowKind::Imported | RowKind::ExportedLane) {
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

fn scope(row: &Value) -> io::Result<&str> {
    row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
        })
        .ok_or_else(|| invalid("component scope"))
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
        "config",
        "localOnly",
        "nextVersion",
    ];
    let shape = row
        .as_object()
        .is_some_and(|fields| {
            fields
                .keys()
                .all(|field| allowed.contains(&field.as_str()))
        });
    let lane_only = row["onLanesOnly"] == true && row["isAvailableOnCurrentLane"] == true;
    let ordinary =
        row.get("onLanesOnly").is_none() && row.get("isAvailableOnCurrentLane").is_none();
    let lane_fields = match kind {
        RowKind::LaneSnap => lane_only,
        RowKind::ExportedLane | RowKind::Staged | RowKind::Imported => lane_only || ordinary,
        RowKind::New => ordinary,
    };
    shape
        && lane_fields
        && row.get("localOnly").is_none_or(Value::is_boolean)
        && row
            .get("nextVersion")
            .is_none_or(|value| value.is_null() || value.is_object())
}
