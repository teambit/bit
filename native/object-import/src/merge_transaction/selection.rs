//! Merge status outcome partitioning ([`results`], [`visible`], [`identity`]: `failed`, `remove`, `succeeded`, `visible`).

use super::{decision::boolean, invalid};
use serde_json::{Value, json};
use std::io;
/// Extracts a bounded array slice for `field` from `input` (at most 4,096 selection rows).
#[inline]
fn array<'a>(input: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    let values = input[field]
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("merge selection count"))?;
    Ok(values)
}
/// Partitions component merge `statuses` into `failed`, `remove`, `succeeded`, and `visible` index lists.
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
/// Extracts the validated `(scope, name)` identity tuple from a merge result or hidden row `value`.
fn identity(value: &Value) -> io::Result<(Option<&str>, &str)> {
    let target = value.get("id").unwrap_or(value);
    if let Some(raw) = target.as_str() {
        return parse_string_identity(raw);
    }
    let scope = match target.get("scope") {
        None | Some(Value::Null) => None,
        Some(Value::String(scope)) if scope.trim().len() <= 4096 && !scope.contains('\0') => {
            Some(scope.trim()).filter(|scope| !scope.is_empty())
        }
        _ => return Err(invalid("merge identity scope")),
    };
    let name = target["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty() && name.len() <= 4096 && !name.contains('\0'))
        .ok_or_else(|| invalid("merge identity name"))?;
    Ok((scope, name))
}
/// Parses a `[scope/]name[@version]` string into a validated `(scope, name)` identity tuple.
fn parse_string_identity(raw: &str) -> io::Result<(Option<&str>, &str)> {
    let raw = raw.trim();
    let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
    let (scope, name) = match bare.split_once('/') {
        Some((scope, name)) => (Some(scope.trim()).filter(|scope| !scope.is_empty()), name.trim()),
        None => (None, bare),
    };
    if name.is_empty()
        || name.len() > 4096
        || name.contains('\0')
        || scope.is_some_and(|scope| scope.len() > 4096 || scope.contains('\0'))
    {
        return Err(invalid("merge identity name"));
    }
    Ok((scope, name))
}

/// Filters `input["results"]` indices to entries whose `(scope, name)` identity is not in `input["hidden"]`.
fn visible(input: &Value) -> io::Result<Vec<usize>> {
    let results = array(input, "results")?;
    let hidden_rows = array(input, "hidden")?;
    if hidden_rows.is_empty() {
        for row in results {
            identity(row)?;
        }
        return Ok((0..results.len()).collect());
    }
    let hidden = hidden_rows
        .iter()
        .map(identity)
        .collect::<io::Result<std::collections::HashSet<_>>>()?;
    let mut selected = Vec::with_capacity(results.len());
    for (index, row) in results.iter().enumerate() {
        if !hidden.contains(&identity(row)?) {
            selected.push(index);
        }
    }
    Ok(selected)
}
