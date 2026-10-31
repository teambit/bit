use super::invalid;
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    pub(super) token: String,
    relative_path: String,
    logs: Vec<Value>,
    #[serde(default)]
    overlays: Vec<Value>,
}
pub(super) fn lineage(request: Request, plan: &Value) -> io::Result<Value> {
    if request.logs.len() > 4096
        || request.relative_path.len() > 32768
        || request.relative_path.contains('\0')
    {
        return Err(invalid("history file query limit"));
    }
    let mut rows = request.overlays;
    if rows.len() > 4096 {
        return Err(invalid("history file overlay limit"));
    }
    rows.extend(
        plan.get("rows")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid("history query rows"))?
            .iter()
            .cloned(),
    );
    let mut results = Vec::new();
    for (index, log) in request.logs.into_iter().enumerate() {
        if let Some(row) = result(log, index, &rows, &request.relative_path)? {
            results.push(row);
        }
    }
    hidden_parents(&mut results);
    results.retain(|row| {
        row.get("hidden") != Some(&Value::Bool(true))
            && row.get("fileHash") != row.get("parentFileHash")
    });
    Ok(json!({"logs":results}))
}
fn result(log: Value, index: usize, rows: &[Value], relative: &str) -> io::Result<Option<Value>> {
    let hash = log
        .get("hash")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history file log"))?;
    let version = version(rows, hash)?;
    let Some(file) = file_hash(version, relative)? else { return Ok(None) };
    let parents = version
        .get("parents")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("history file parents"))?;
    let parent = parent_hash(rows, parents, relative, &file)?;
    let mut row = log;
    if !row.is_object() {
        return Err(invalid("history file log shape"));
    }
    row["logIndex"] = json!(index);
    row["fileHash"] = json!(file);
    if let Some(parent) = parent {
        row["parentFileHash"] = json!(parent);
    }
    row["parentHashes"] = json!(parents);
    Ok(Some(row))
}
fn version<'a>(rows: &'a [Value], hash: &str) -> io::Result<&'a Value> {
    rows.iter()
        .find(|row| {
            row.get("hash").and_then(Value::as_str) == Some(hash) && row.get("missing").is_none()
        })
        .ok_or_else(|| invalid("history file missing Version"))
}
fn file_hash(version: &Value, relative: &str) -> io::Result<Option<String>> {
    let files = version
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("history file missing manifest"))?;
    let Some(file) = files
        .iter()
        .find(|file| file.get("relativePath").and_then(Value::as_str) == Some(relative))
    else {
        return Ok(None);
    };
    let hash = file
        .get("file")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history file Source ref"))?;
    crate::merge_history::hash(hash)?;
    Ok(Some(hash.to_owned()))
}
fn parent_hash(
    rows: &[Value],
    parents: &[Value],
    relative: &str,
    current: &str,
) -> io::Result<Option<String>> {
    let mut hashes = Vec::new();
    for parent in parents {
        let parent = parent.as_str().ok_or_else(|| invalid("history file parent ref"))?;
        hashes.push(file_hash(version(rows, parent)?, relative)?);
    }
    if hashes.len() > 1
        && hashes
            .iter()
            .any(|hash| hash.as_deref() == Some(current))
    {
        return Ok(Some(current.to_owned()));
    }
    Ok(hashes.into_iter().next().flatten())
}
fn hidden_parents(results: &mut [Value]) {
    for index in 0..results.len() {
        let Some(parents) = results[index].get("parentHashes").and_then(Value::as_array) else {
            continue;
        };
        if parents.len() != 1 {
            continue;
        }
        let Some(parent) = results
            .iter()
            .find(|row| {
                row.get("hash") == Some(&parents[0])
                    && row.get("hidden") == Some(&Value::Bool(true))
            })
        else {
            continue;
        };
        let value = parent.get("parentFileHash").cloned();
        if let Some(value) = value {
            results[index]["parentFileHash"] = value;
        } else if let Some(object) = results[index].as_object_mut() {
            object.remove("parentFileHash");
        }
    }
}
