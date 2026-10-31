use super::{decision::boolean, invalid};
use serde_json::{Value, json};
use std::io;
fn relative_path(file: &Value) -> io::Result<&str> {
    file.as_str()
        .or_else(|| file["relativePath"].as_str())
        .or_else(|| file["path"].as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("merge current relative path"))
}
fn removed_entry(file: &Value, path: &str) -> Value {
    if file["path"].is_null() { Value::String(path.to_owned()) } else { file["path"].clone() }
}
pub(super) fn apply(input: &Value, current: &[Value]) -> io::Result<Value> {
    let mut statuses = input["filesStatus"]
        .as_array()
        .filter(|rows| rows.len() <= 8192)
        .ok_or_else(|| invalid("merge removal statuses"))?
        .clone();
    let mut removed = Vec::new();
    if !boolean(input, "tracked")? {
        return Ok(json!({"filesStatus":statuses,"removals":removed}));
    }
    let root = boolean(input, "workspaceRoot")?;
    for file in current {
        let path = relative_path(file)?;
        if !(root && path == ".bitmap") && status(&mut statuses, path)? == "removed" {
            removed.push(removed_entry(file, path));
        }
    }
    Ok(json!({"filesStatus":statuses,"removals":removed}))
}

fn status<'a>(statuses: &'a mut Vec<Value>, path: &str) -> io::Result<&'a str> {
    let found = statuses
        .iter()
        .position(|row| row["relativePath"] == path || row["path"] == path);
    let status = if let Some(index) = found {
        statuses[index]["status"].as_str().ok_or_else(|| invalid("merge file status"))?
    } else {
        if [
            "__proto__",
            "constructor",
            "toString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "toLocaleString",
            "__defineGetter__",
            "__defineSetter__",
            "__lookupGetter__",
            "__lookupSetter__",
        ]
        .contains(&path)
        {
            return Err(invalid("merge inherited file status"));
        }
        statuses.push(json!({"relativePath":path,"status":"removed"}));
        "removed"
    };
    Ok(status)
}
