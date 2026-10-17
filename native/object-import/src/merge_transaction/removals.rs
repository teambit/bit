use super::{decision::boolean, invalid};
use serde_json::{Value, json};
use std::io;
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
        let path =
            file["relativePath"].as_str().ok_or_else(|| invalid("merge current relative path"))?;
        if root && path == ".bitmap" {
            continue;
        }
        let status = status(&mut statuses, path)?;
        if status == "removed" {
            removed.push(file["path"].clone());
        }
    }
    Ok(json!({"filesStatus":statuses,"removals":removed}))
}

fn status<'a>(statuses: &'a mut Vec<Value>, path: &str) -> io::Result<&'a str> {
    let found = statuses
        .iter()
        .position(|row| row["relativePath"] == path);
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
