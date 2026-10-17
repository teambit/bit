use super::{decision::boolean, invalid};
use serde_json::{Value, json};
use std::io;
fn array<'a>(input: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    let values = input[field]
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("merge selection count"))?;
    Ok(values)
}
pub(super) fn results(input: &Value) -> io::Result<Value> {
    let mut failed = Vec::new();
    let mut removed = Vec::new();
    let mut succeeded = Vec::new();
    for (index, row) in array(input, "statuses")?.iter().enumerate() {
        let unchanged = boolean(row, "unchanged")?;
        let remove = boolean(row, "removed")?;
        if unchanged && !remove {
            failed.push(index);
        }
        if remove {
            removed.push(index);
        }
        if !unchanged {
            succeeded.push(index);
        }
    }
    let visible = visible(input)?;
    Ok(json!({"failed":failed,"remove":removed,"succeeded":succeeded,"visible":visible}))
}
fn identity(value: &Value) -> io::Result<(Option<&str>, &str)> {
    let scope = match value.get("scope") {
        None | Some(Value::Null) => None,
        Some(Value::String(scope)) => Some(scope.as_str()),
        _ => return Err(invalid("merge identity scope")),
    };
    let name = value["name"]
        .as_str()
        .filter(|name| !name.is_empty() && name.len() <= 4096)
        .ok_or_else(|| invalid("merge identity name"))?;
    Ok((scope, name))
}

fn visible(input: &Value) -> io::Result<Vec<usize>> {
    let hidden = array(input, "hidden")?
        .iter()
        .map(identity)
        .collect::<io::Result<Vec<_>>>()?;
    let mut selected = Vec::new();
    for (index, row) in array(input, "results")?.iter().enumerate() {
        if !hidden.contains(&identity(row)?) {
            selected.push(index);
        }
    }
    Ok(selected)
}
