//! Format raw file comparison rows for the public diff result.

use super::files;
use crate::commands::status::js::{array, text, truthy};
use serde_json::{Value, json};
use std::io;

/// `filesDiff`: every file whose formatted diff is not empty.
pub(super) fn files_diff(
    row: &Value,
    left_version: &str,
    right_version: &str,
) -> io::Result<Vec<Value>> {
    let (left_version, right_version) = (left_version.trim(), right_version.trim());
    let labels = if left_version == right_version {
        (format!("{left_version} original"), format!("{right_version} modified"))
    } else {
        (left_version.to_string(), right_version.to_string())
    };
    let mut output = Vec::new();
    for file in array(row.get("files"), "diff files")? {
        if let Some(diff) = one_file_diff(file, &labels)? {
            output.push(diff);
        }
    }
    Ok(output)
}

fn one_file_diff(file: &Value, labels: &(String, String)) -> io::Result<Option<Value>> {
    if truthy(file.get("same")) {
        return Ok(None);
    }
    let path = text(
        file.get("relativePath")
            .or_else(|| file.get("path"))
            .or_else(|| file.get("filePath")),
    )?
    .trim();
    let path = if cfg!(windows) { path.replace('/', r"\") } else { path.to_owned() };
    let raw = text(file.get("rawDiff"))?;
    let raw = raw
        .strip_suffix('\n')
        .map_or(raw, |raw| raw.strip_suffix('\r').unwrap_or(raw));
    let diff = files::format(raw, &labels.0, &labels.1, &path);
    if diff.is_empty() {
        return Ok(None);
    }
    let status = if truthy(file.get("fromEmpty")) {
        "NEW"
    } else if truthy(file.get("toEmpty")) {
        "DELETED"
    } else {
        "MODIFIED"
    };
    Ok(Some(json!({ "filePath": path, "status": status, "diffOutput": diff })))
}

/// The comparisons to report: without a pattern, new components, then modified ones.
pub(super) fn rows(result: &Value, all: bool) -> io::Result<Vec<&Value>> {
    let rows = array(result.get("comparisons"), "comparisons")?;
    if all {
        return Ok(rows.iter().collect());
    }
    let has_model = |row: &&Value| truthy(row.get("model"));
    let new = rows
        .iter()
        .filter(|row| !has_model(row));
    let modified = rows
        .iter()
        .filter(|row| has_model(row) && truthy(row.get("modified")));
    Ok(new.chain(modified).collect())
}
