use super::{Value, invalid};
use std::io;
pub(super) fn identity(key: &str, row: &Value) -> Option<String> {
    let name = row["name"].as_str().unwrap_or(key);
    let scope = row["scope"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| row["defaultScope"].as_str())?;
    let version = row["version"].as_str().unwrap_or_default();
    Some(format!(
        "{scope}/{name}{}",
        if version.is_empty() { String::new() } else { format!("@{version}") },
    ))
}
pub(super) fn key<'a>(bitmap: &'a Value, id: &str) -> io::Result<&'a str> {
    let id = id.split('@').next().unwrap_or(id);
    bitmap
        .as_object()
        .ok_or_else(|| invalid("invalid component bitmap"))?
        .iter()
        .find_map(|(key, row)| {
            let full = identity(key, row)?;
            let full = full.split('@').next()?;
            (full == id || row["name"] == id || key == id).then_some(key.as_str())
        })
        .ok_or_else(|| invalid(format!("component {id} was not found")))
}
pub(super) fn resolve(bitmap: &Value, id: &str) -> io::Result<String> {
    let key = key(bitmap, id)?;
    identity(key, &bitmap[key]).ok_or_else(|| invalid("component identity"))
}
pub(super) fn select(bitmap: &Value, pattern: &str) -> io::Result<Vec<String>> {
    validate_pattern(pattern)?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("invalid component bitmap"))?;
    let pattern = if pattern == "$deprecated" { "**" } else { pattern };
    let parts = pattern
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>();
    let mut result = vec![];
    for (key, row) in rows {
        if row["isAvailableOnCurrentLane"] == false {
            continue;
        }
        let Some(id) = identity(key, row) else { continue };
        if matches_parts(key, row, &id, &parts) {
            result.push(id);
        }
    }
    if result.is_empty() {
        return Err(invalid(format!(r#"no components match the pattern "{pattern}""#)));
    }
    Ok(result)
}
fn validate_pattern(pattern: &str) -> io::Result<()> {
    if pattern.contains('$') && pattern != "$deprecated" {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "deprecation state selector requires component facts",
        ));
    }
    Ok(())
}
fn matches_parts(key: &str, row: &Value, id: &str, parts: &[&str]) -> bool {
    let bare = id.split('@').next().unwrap_or(id);
    let matches = |pattern: &str| {
        bit_workspace_config::glob::matches(pattern, bare)
            || bit_workspace_config::glob::matches(pattern, row["name"].as_str().unwrap_or(key))
    };
    parts
        .iter()
        .filter(|pattern| !pattern.starts_with('!'))
        .any(|p| matches(p))
        && !parts
            .iter()
            .filter_map(|p| p.strip_prefix('!'))
            .any(matches)
}
pub(super) fn id_object(bitmap: &Value, id: &str) -> io::Result<Value> {
    let (bare, version) = id
        .rsplit_once('@')
        .map_or((id, None), |(id, v)| (id, Some(v)));
    let (scope, name) = bare.split_once('/').ok_or_else(|| invalid("replacement component ID"))?;
    let authored = key(bitmap, id)
        .ok()
        .is_some_and(|key| bitmap[key]["scope"].as_str().is_none_or(str::is_empty));
    let mut value = if authored {
        serde_json::json!({"name":name})
    } else {
        serde_json::json!({"scope":scope,"name":name})
    };
    if let Some(version) = version {
        value["version"] = Value::String(version.into());
    }
    if authored {
        value["scope"] = Value::String(scope.into());
    }
    Ok(value)
}
