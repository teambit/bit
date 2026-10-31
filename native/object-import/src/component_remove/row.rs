//! Validate a bitmap row before native local removal.

use super::{RowKind, invalid, valid_name, valid_scope};
use serde_json::Value;
use std::io;

pub(super) fn supported_row<'a>(
    key: &'a str,
    row: &'a Value,
    kind: RowKind,
) -> io::Result<(&'a str, &'a str)> {
    let key_id = key.rsplit_once('@').map_or(key, |(id, _)| id);
    let (id_scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
    let scope = scope(row, id_scope)?;
    let identity = (key_id == name || key_id == format!("{scope}/{name}"))
        && valid_name(name)
        && valid_scope(scope);
    let local = if matches!(kind, RowKind::Imported | RowKind::ExportedLane) {
        (row["scope"] == scope || (row.get("scope").is_none() && id_scope == Some(scope)))
            && row.get("defaultScope").is_none()
    } else {
        row["scope"]
            .as_str()
            .unwrap_or_default()
            .is_empty()
    };
    if !identity
        || !local
        || !has_supported_version(key, row, kind)
        || !supported_row_shape(row, kind)
    {
        return Err(invalid("component is outside the supported local state"));
    }
    Ok((name, scope))
}

fn has_supported_version(key: &str, row: &Value, kind: RowKind) -> bool {
    let version = row["version"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .or_else(|| {
            key.trim()
                .rsplit_once('@')
                .map(|(_, ver)| ver.trim())
                .filter(|val| !val.is_empty())
        });
    if kind == RowKind::New { version.is_none() } else { version.is_some() }
}

fn scope<'a>(row: &'a Value, fallback: Option<&'a str>) -> io::Result<&'a str> {
    row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
        })
        .or_else(|| {
            fallback
                .map(str::trim)
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
        "exported",
        "files",
        "wrapDir",
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
