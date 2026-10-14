use super::{invalid, visibility::effective_scope};
use crate::command_import::PreparedImport;
use serde_json::{Value, json};
use std::io;

#[cfg(test)]
mod tests;

pub(super) fn prepare(
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
pub(super) fn targets(additions: &[Value], selected: &[Value]) -> Vec<Value> {
    additions.iter().filter_map(|addition| {
        let identity = format!("{}/{}", addition["scope"].as_str()?, addition["name"].as_str()?);
        selected.iter().find(|target| target["identity"] == identity && target["currentIdPresent"] == false && target["bitmapPresent"] == false)?;
        Some(json!({"identity":identity,"version":addition["version"],"directory":addition["rootDir"],"mainFile":addition["mainFile"],"config":null,"packageJson":null}))
    }).collect()
}

fn prepare_one(
    imported: &mut PreparedImport,
    rows: &serde_json::Map<String, Value>,
    settings: &Value,
    target: &Value,
) -> io::Result<Value> {
    let identity =
        target["identity"].as_str().ok_or_else(|| invalid("lane destination identity"))?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("lane destination scope"))?;
    let existing = rows
        .values()
        .find(|row| effective_scope(row) == Some(scope) && row["name"] == name);
    let directory = match existing {
        Some(row) => row["rootDir"]
            .as_str()
            .ok_or_else(|| invalid("lane destination tracked root"))?
            .to_owned(),
        None => directory(settings, scope, name)?,
    };
    let head = target["head"].as_str().ok_or_else(|| invalid("lane destination version"))?;
    let version = imported.lane_version(head)?;
    crate::workspace::engine::status_models::harmony::validate(&version)?;
    let main = version["mainFile"].as_str().ok_or_else(|| invalid("lane destination main file"))?;
    crate::checkout::plan::relative_path(main)?;
    Ok(json!({"name":name,"scope":scope,"version":head,"mainFile":main,"rootDir":directory}))
}
fn validate_overlap<'a>(addition: &Value, rows: impl Iterator<Item = &'a Value>) -> io::Result<()> {
    let directory = addition["rootDir"].as_str().unwrap();
    for row in rows {
        if effective_scope(row) == addition["scope"].as_str() && row["name"] == addition["name"] {
            continue;
        }
        if let Some(other) = row["rootDir"].as_str()
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
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
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
