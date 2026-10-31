#[cfg(test)]
mod tests;

use super::{invalid, visibility::effective_scope};
use crate::command_import::PreparedImport;
use serde_json::{Value, json};
use std::{io, path::Path};

pub(in crate::workspace::engine::command) fn prepare(
    imported: &mut PreparedImport,
    bitmap: &Value,
    settings: &Value,
    selected: &[Value],
) -> io::Result<Vec<Value>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("lane destination bitmap"))?;
    let mut additions = Vec::new();
    for target in selected
        .iter()
        .filter(|target| target["visible"] != true && target["hidden"] != true)
    {
        let addition = prepare_one(imported, rows, settings, target)?;
        validate_overlap(&addition, rows.values().chain(additions.iter()))?;
        additions.push(addition);
    }
    Ok(additions)
}

/// A switch can bring a lane-only component into a workspace whose existing
/// component owns the parent of the default directory. `ComponentWriter` moves
/// the incoming directory's overlapping prefix aside (`alpha/gamma` becomes
/// `alpha_1/gamma`) before writing. Resolve that case before retaining a plan.
pub(in crate::workspace::engine::command) fn prepare_switch(
    imported: &mut PreparedImport,
    root: &Path,
    bitmap: &Value,
    settings: &Value,
    selected: &[Value],
) -> io::Result<Vec<Value>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("switch destination bitmap"))?;
    let mut additions = Vec::new();
    for target in selected {
        let mut addition = prepare_one(imported, rows, settings, target)?;
        relocate_nested(&mut addition, &rows.values().chain(additions.iter()))?;
        validate_overlap(&addition, rows.values().chain(additions.iter()))?;
        let directory =
            trimmed_str(&addition["rootDir"]).ok_or_else(|| invalid("switch destination"))?;
        if root.join(directory).try_exists()? {
            return Err(invalid("switch occupied destination requires canonical writer"));
        }
        additions.push(addition);
    }
    Ok(additions)
}

fn relocate_nested<'a>(
    addition: &mut Value,
    rows: &(impl Iterator<Item = &'a Value> + Clone),
) -> io::Result<()> {
    let directory = trimmed_str(&addition["rootDir"]).ok_or_else(|| invalid("switch destination"))?;
    let parent = (*rows)
        .clone()
        .filter_map(|row| trimmed_str(&row["rootDir"]))
        .find(|root| directory.starts_with(&format!("{root}/")));
    let Some(parent) = parent else { return Ok(()) };
    let suffix = directory
        .strip_prefix(parent)
        .ok_or_else(|| invalid("switch destination prefix"))?
        .to_owned();
    for index in 1..=4096 {
        let candidate = format!("{parent}_{index}{suffix}");
        crate::checkout::plan::relative_path(&candidate)?;
        addition["rootDir"] = json!(candidate);
        if validate_overlap(addition, (*rows).clone()).is_ok() {
            return Ok(());
        }
    }
    Err(invalid("switch destination collision budget"))
}
pub(in crate::workspace::engine::command) fn targets(
    additions: &[Value],
    selected: &[Value],
) -> Vec<Value> {
    additions.iter().filter_map(|addition| {
        let identity = format!("{}/{}", trimmed_str(&addition["scope"])?, trimmed_str(&addition["name"])?);
        selected.iter().find(|target| trimmed_str(&target["identity"]) == Some(identity.as_str()) && target["currentIdPresent"] == false && target["bitmapPresent"] == false)?;
        Some(json!({"identity":identity,"version":addition["version"],"directory":addition["rootDir"],"mainFile":addition["mainFile"],"config":null,"packageJson":null}))
    }).collect()
}

fn trimmed_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn prepare_one(
    imported: &mut PreparedImport,
    rows: &serde_json::Map<String, Value>,
    settings: &Value,
    target: &Value,
) -> io::Result<Value> {
    let identity =
        trimmed_str(&target["identity"]).ok_or_else(|| invalid("lane destination identity"))?;
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| invalid("lane destination scope"))?;
    let existing = rows
        .iter()
        .find(|(key, row)| {
            let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
            !key.starts_with('$')
                && !matches!(key.as_str(), "_bit_lane" | "version")
                && row.is_object()
                && (row_scope.map(str::trim), row_name.trim()) == (Some(scope), name)
        })
        .map(|(_, row)| row);
    let directory = match existing {
        Some(row) => trimmed_str(&row["rootDir"])
            .ok_or_else(|| invalid("lane destination tracked root"))?
            .to_owned(),
        None => directory(settings, scope, name)?,
    };
    let head = trimmed_str(&target["head"]).ok_or_else(|| invalid("lane destination version"))?;
    let version = imported.lane_version(head)?;
    crate::workspace::engine::status_models::harmony::validate(&version)?;
    let main =
        trimmed_str(&version["mainFile"]).ok_or_else(|| invalid("lane destination main file"))?;
    crate::checkout::plan::relative_path(main)?;
    Ok(json!({"name":name,"scope":scope,"version":head,"mainFile":main,"rootDir":directory}))
}
fn validate_overlap<'a>(addition: &Value, rows: impl Iterator<Item = &'a Value>) -> io::Result<()> {
    let directory =
        trimmed_str(&addition["rootDir"]).ok_or_else(|| invalid("lane destination root"))?;
    let addition_scope = trimmed_str(&addition["scope"]);
    let addition_name = trimmed_str(&addition["name"]);
    for row in rows {
        if effective_scope(row) == addition_scope && trimmed_str(&row["name"]) == addition_name {
            continue;
        }
        if let Some(other) = trimmed_str(&row["rootDir"])
            && (directory == other
                || directory.starts_with(&format!("{other}/"))
                || other.starts_with(&format!("{directory}/")))
        {
            return Err(invalid("lane destination requires canonical collision resolution"));
        }
    }
    Ok(())
}

fn directory(settings: &Value, scope_id: &str, name: &str) -> io::Result<String> {
    let pattern = settings
        .get("defaultDirectory")
        .and_then(trimmed_str)
        .unwrap_or("components/{name}");
    let pattern =
        if pattern.contains("{name}") { pattern.to_owned() } else { format!("{pattern}/{{name}}") };
    let mut parts = scope_id.split('.');
    let first = parts.next().ok_or_else(|| invalid("lane destination scope"))?;
    let (owner, scope) = parts
        .next()
        .map_or(("", first), |scope| (first, scope));
    let pattern = if owner.is_empty() {
        pattern.replacen("{owner}.", "", 1).replacen("{owner}/", "", 1)
    } else {
        pattern
    };
    let directory = pattern
        .replace("{scopeId}", scope_id)
        .replace("{scope}", scope)
        .replace("{owner}", owner)
        .replace("{name}", name);
    if directory.contains(['{', '}']) || directory == "." || directory.len() > 4096 {
        return Err(invalid("lane destination pattern"));
    }
    crate::checkout::plan::relative_path(&directory)?;
    Ok(directory)
}
