use super::{Value, invalid};
use std::io;
pub(crate) fn identity(key: &str, row: &Value) -> Option<String> {
    if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
        return None;
    }
    let (key_id, key_ver) = key
        .rsplit_once('@')
        .map_or((key, None), |(id, ver)| (id, Some(ver)));
    let key_scope = key_id.split_once('/').map(|(scope, _)| scope);
    let scope = row["scope"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|value| !value.is_empty())
        })
        .or(key_scope)?;
    let name = row["name"]
        .as_str()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(&format!("{scope}/"))
                .unwrap_or(key_id)
        });
    let version = row["version"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| key_ver.filter(|value| !value.is_empty()))
        .unwrap_or_default();
    Some(format!(
        "{scope}/{name}{}",
        if version.is_empty() { String::new() } else { format!("@{version}") },
    ))
}
pub(crate) fn key<'a>(bitmap: &'a Value, id: &str) -> io::Result<&'a str> {
    let id = id.split('@').next().unwrap_or(id);
    bitmap
        .as_object()
        .ok_or_else(|| invalid("invalid component bitmap"))?
        .iter()
        .find_map(|(key, row)| {
            let full = identity(key, row)?;
            let full = full.split('@').next()?;
            let (_, name) = crate::reset_lane::bitmap::row_identity(key, row);
            let key_bare = key.rsplit_once('@').map_or(key.as_str(), |(bare, _)| bare);
            (full == id || name == id || key_bare == id).then_some(key.as_str())
        })
        .ok_or_else(|| invalid(format!("component {id} was not found")))
}
pub(crate) fn resolve(bitmap: &Value, id: &str) -> io::Result<String> {
    let key = key(bitmap, id)?;
    identity(key, &bitmap[key]).ok_or_else(|| invalid("component identity"))
}
pub(crate) fn select(bitmap: &Value, pattern: &str) -> io::Result<Vec<String>> {
    validate_pattern(pattern)?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("invalid component bitmap"))?;
    let pattern = if pattern == "$deprecated" { "**" } else { pattern };
    let parts = pattern
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>();
    let mut result = vec![];
    for (key, row) in rows {
        if row["isAvailableOnCurrentLane"] == false
            || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        {
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
    let bare = id.rsplit_once('@').map_or(id, |(bare_id, _)| bare_id);
    let (_, name) = crate::reset_lane::bitmap::row_identity(key, row);
    let matches = |pattern: &str| {
        let pat_bare = pattern.rsplit_once('@').map_or(pattern, |(pat_id, _)| pat_id);
        bit_workspace_config::glob::matches(pattern, id)
            || bit_workspace_config::glob::matches(pattern, bare)
            || bit_workspace_config::glob::matches(pattern, name)
            || (pat_bare != pattern
                && (bit_workspace_config::glob::matches(pat_bare, bare)
                    || bit_workspace_config::glob::matches(pat_bare, name)))
    };
    parts
        .iter()
        .filter(|pattern| !pattern.starts_with('!'))
        .any(|pat| matches(pat))
        && !parts
            .iter()
            .filter_map(|pat| pat.strip_prefix('!'))
            .any(matches)
}
pub(crate) fn id_object(bitmap: &Value, id: &str) -> io::Result<Value> {
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
