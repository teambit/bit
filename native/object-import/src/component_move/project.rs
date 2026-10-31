use super::{Observed, Value, invalid, paths, unsupported};
use serde_json::json;
use std::{io, path::Path};
pub(super) fn apply(
    root: &Path,
    bitmap: &mut Value,
    source: &Path,
    destination: &Path,
    observed: &mut Observed,
) -> io::Result<Vec<Value>> {
    let from = paths::relative(root, source)?;
    let to = paths::relative(root, destination)?;
    let inventory_bitmap = bitmap.clone();
    let rows = bitmap.as_object_mut().ok_or_else(|| invalid("component bitmap"))?;
    let mut changes = vec![];
    for (key, row) in rows {
        let Some(directory) = row["rootDir"].as_str().map(str::to_owned) else {
            continue;
        };
        let identity = identity(key, row)?;
        let full = id(key, &identity, row);
        let edited = if directory.starts_with(&from) {
            let next = directory.replacen(&from, &to, 1);
            row["rootDir"] = json!(next);
            vec![json!({"from":directory,"to":next})]
        } else if from.starts_with(&format!("{directory}/")) {
            internal(root, &directory, row, &from, &to, &inventory_bitmap, observed)?
        } else {
            vec![]
        };
        if !edited.is_empty() {
            changes.push(json!({"id":full,"identity":identity,"changes":edited}));
        }
    }
    if changes.is_empty() {
        return Err(invalid(format!(
            "directory {} is not a tracked component",
            source
                .strip_prefix(root)
                .unwrap_or(source)
                .display(),
        )));
    }
    Ok(changes)
}
fn internal(
    root: &Path,
    directory: &str,
    row: &mut Value,
    from: &str,
    to: &str,
    bitmap: &Value,
    observed: &mut Observed,
) -> io::Result<Vec<Value>> {
    if !to.starts_with(&format!("{directory}/")) {
        return Err(unsupported("move nested sources outside component root"));
    }
    let files = crate::component_tracking::source_inventory(root, directory, bitmap, observed)?;
    let files = super::order::files(root, directory, &files)?;
    let mut changes = vec![];
    for old in files
        .into_iter()
        .filter(|file| matches_from(file, from, cfg!(windows)))
    {
        let next = old.replacen(from, to, 1);
        let prefix = format!("{directory}/");
        let old = old.strip_prefix(&prefix).ok_or_else(|| invalid("move component path"))?;
        let next = next.strip_prefix(&prefix).ok_or_else(|| invalid("move component path"))?;
        if row["mainFile"] == old {
            row["mainFile"] = json!(next);
        }
        changes.push(json!({"from":old,"to":next}));
    }
    Ok(changes)
}
fn identity(key: &str, row: &Value) -> io::Result<String> {
    let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    let scope = row_scope.ok_or_else(|| unsupported("unscoped move component"))?;
    Ok(format!("{scope}/{row_name}"))
}
fn id(key: &str, identity: &str, row: &Value) -> String {
    row["version"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            key.rsplit_once('@')
                .map(|(_, ver)| ver)
                .filter(|ver| !ver.is_empty())
        })
        .map_or_else(|| identity.into(), |version| format!("{identity}@{version}"))
}

// ComponentMap.updateDirLocation compares native path.join output with a Linux
// normalized dirFrom. Its Windows nested-directory mismatch is observable.
fn matches_from(file: &str, from: &str, windows: bool) -> bool {
    if windows { file.replace('/', r"\").starts_with(from) } else { file.starts_with(from) }
}

#[cfg(test)]
mod tests;
