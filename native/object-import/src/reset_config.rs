//! Restore `.bitmap` aspect settings ([`read`]) saved by `version-maker.updateVersions` during a snap.

use serde_json::{Map, Value};
use std::{fs, io, path::Path};

/// Reads the staged aspect configuration entry for `scope`/`name` saved during a snap or tag.
pub(crate) fn read(
    root: &Path,
    lane: Option<(&str, &str)>,
    scope: &str,
    name: &str,
) -> io::Result<Option<Value>> {
    let path = file(root, lane)?;
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(invalid("reset staged config oversized"));
    }
    let mut value: Value = crate::parse_jsonc(&bytes)?;
    let rows = value
        .as_array_mut()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("reset staged config rows"))?;
    let mut selected = None;
    for row in rows {
        if crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
            row, scope, name,
        ) && selected.replace(row).is_some()
        {
            return Err(invalid("reset duplicate staged config"));
        }
    }
    selected
        .and_then(|row| row.get_mut("config"))
        .map(Value::take)
        .filter(|config| !config.is_null())
        .map(sanitized)
        .transpose()
}

/// Reconstructs a `.bitmap` component row for a soft-deleted component from the lane staged-config file.
pub(crate) fn removed_lane_row(
    root: &Path,
    lane_scope: &str,
    lane_name: &str,
    scope: &str,
    name: &str,
) -> io::Result<Option<Value>> {
    let path = file(root, Some((lane_scope, lane_name)))?;
    let bytes = fs::read(path)?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(invalid("reset staged config oversized"));
    }
    let rows: Value = crate::parse_jsonc(&bytes)?;
    let rows = rows
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("reset removed staged rows"))?;
    let Some(staged) = find_removed_staged(rows, scope, name) else {
        return Ok(None);
    };
    let map =
        staged["componentMapObject"].as_object().ok_or_else(|| invalid("reset removed map"))?;
    let main_file = non_empty(map.get("mainFile"), "reset removed main file")?;
    let root_dir = non_empty(map.get("rootDir"), "reset removed root dir")?;
    validate_relative_path(main_file, "reset removed main file")?;
    validate_relative_path(root_dir, "reset removed root dir")?;
    let version = non_empty(staged["id"].get("version"), "reset removed version")?;
    Ok(Some(serde_json::json!({
        "name":name,"scope":scope,"version":version,"mainFile":main_file,"rootDir":root_dir,
    })))
}

fn validate_relative_path(path: &str, message: &str) -> io::Result<()> {
    if path.contains('\0')
        || path
            .split(['/', '\\'])
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid(message));
    }
    Ok(())
}

fn find_removed_staged<'a>(rows: &'a [Value], scope: &str, name: &str) -> Option<&'a Value> {
    rows.iter()
        .find(|row| {
            crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                row, scope, name,
            )
        })
        .filter(|row| {
            crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        })
}

#[inline]
fn non_empty<'a>(value: Option<&'a Value>, message: &str) -> io::Result<&'a str> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid(message))
}

#[inline]
pub(crate) fn restore(row: &mut Map<String, Value>, config: Option<Value>) {
    if let Some(config) = config {
        row.entry("config").or_insert(config);
    }
}

fn sanitized(mut config: Value) -> io::Result<Value> {
    let aspects = config.as_object_mut().ok_or_else(|| invalid("reset staged aspect config"))?;
    for value in aspects.values_mut() {
        if let Some(fields) = value.as_object_mut() {
            fields.shift_remove("__specific");
        }
    }
    Ok(config)
}

fn file(root: &Path, lane: Option<(&str, &str)>) -> io::Result<std::path::PathBuf> {
    let base = crate::scope_path(root).join("staged-config");
    let Some((scope, name)) = lane else {
        return Ok(base.join("main.json"));
    };
    let (scope, name) = (scope.trim(), name.trim());
    if [scope, name]
        .iter()
        .any(|part| {
            part.is_empty() || *part == "." || *part == ".." || part.contains(['/', '\\', '\0'])
        })
    {
        return Err(invalid("reset staged config path"));
    }
    Ok(base
        .join(scope)
        .join(format!("{name}.json")))
}

#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
