#[cfg(test)]
mod tests;

use super::invalid;
use serde_json::{Value, json};
use std::io;

/// Harmony 1 predates always-scoped IDs, but imported scoped objects use the
/// same file layout as Harmony 2. Never infer scopes for historical aliases.
pub(in crate::workspace::engine) fn validate(value: &Value) -> io::Result<()> {
    if !matches!(value["schema"].as_str(), Some("1.0.0" | "2.0.0")) {
        return Err(invalid("command legacy Version"));
    }
    for field in ["dependencies", "devDependencies"] {
        let Some(rows) = value.get(field) else {
            continue;
        };
        for row in rows.as_array().ok_or_else(|| invalid("Harmony dependencies"))? {
            flattened_identity(&row["id"])?;
            if !row["relativePaths"].as_array().is_some_and(Vec::is_empty) {
                return Err(invalid("Harmony relative dependency paths"));
            }
        }
    }
    flattened(value, |_| {})
}

/// Consumer projection only: stored Version bytes remain the repository's
/// authority. Defaults and old flattened IDs mirror Version.parse.
pub(in crate::workspace::engine) fn project(value: &Value) -> io::Result<Value> {
    validate(value)?;
    let mut output = value.clone();
    defaults(&mut output);
    let mut dependencies = Vec::new();
    flattened(value, |id| dependencies.push(id))?;
    output["flattenedDependencies"] = json!(dependencies);
    output
        .as_object_mut()
        .unwrap()
        .remove("flattenedDevDependencies");
    Ok(output)
}

fn flattened(value: &Value, mut visit: impl FnMut(Value)) -> io::Result<()> {
    for field in ["flattenedDependencies", "flattenedDevDependencies"] {
        let Some(rows) = value.get(field) else {
            continue;
        };
        let rows = rows.as_array().ok_or_else(|| invalid("Harmony flattened dependencies"))?;
        let strings = rows.first().is_some_and(Value::is_string);
        for row in rows {
            if row.is_string() != strings {
                return Err(invalid("Harmony mixed flattened dependency representation"));
            }
            visit(flattened_identity(row)?);
        }
    }
    Ok(())
}

fn defaults(output: &mut Value) {
    for field in ["dependencies", "devDependencies", "extensions", "parents", "modified"] {
        if output.get(field).is_none() {
            output[field] = json!([]);
        }
    }
    // ConsumerComponent supplies docs even when an older Version omitted it.
    if output.get("docs").is_none_or(Value::is_null) {
        output["docs"] = json!([]);
    }
    for field in [
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "overrides",
        "packageJsonChangedProps",
    ] {
        if output.get(field).is_none_or(Value::is_null) {
            output[field] = json!({});
        }
    }
}

fn identity(value: &Value) -> io::Result<Value> {
    let scope = value["scope"]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid("Harmony dependency scope"))?;
    let name = value["name"]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid("Harmony dependency name"))?;
    if scope.contains(['/', '@']) || name.contains('@') {
        return Err(invalid("Harmony dependency identity"));
    }
    let mut output = json!({"scope":scope,"name":name});
    if let Some(version) = value.get("version") {
        let version = version
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("Harmony dependency version"))?;
        if !version.is_empty() && !matches!(version, "latest" | "head") {
            output["version"] = json!(version);
        }
    }
    Ok(output)
}

fn flattened_identity(value: &Value) -> io::Result<Value> {
    let Some(text) = value.as_str().map(str::trim) else {
        return identity(value);
    };
    let (name, version) = text
        .rsplit_once('@')
        .map_or((text, None), |(name, version)| (name.trim(), Some(version.trim())));
    let (scope, name) =
        name.split_once('/').ok_or_else(|| invalid("Harmony unscoped flattened dependency"))?;
    let mut value = json!({"scope":scope,"name":name});
    if let Some(version) = version {
        value["version"] = json!(version);
    }
    identity(&value)
}
