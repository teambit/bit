//! Tag-blocking component issue [`capture`] and [`target`] filtering for merged [`Row`] dependency policies.
//! Rejects unsupported tag-blocking issue types outside `MissingManuallyConfiguredPackages`.

use super::{super::Row, invalid, projection};
use serde_json::{Value, json};
use std::io;

/// The merged component's tag blockers, without the issue types `ignored` names
/// (`throwForComponentIssues` removes them before checking).
pub(super) fn capture(
    row: &Row,
    value: &Value,
    ignored: &[String],
    output: &mut Vec<Value>,
) -> io::Result<()> {
    let issues: Vec<Value> = projection::array(value)?
        .iter()
        .filter(|issue| {
            !issue["type"]
                .as_str()
                .map(str::trim)
                .is_some_and(|kind| {
                    ignored
                        .iter()
                        .any(|name| name.trim() == kind)
                })
        })
        .cloned()
        .collect();
    if issues.is_empty() {
        return Ok(());
    }
    for issue in &issues {
        if issue["type"].as_str().map(str::trim) != Some("MissingManuallyConfiguredPackages") {
            return Err(invalid("command unsupported merged dependency issue"));
        }
        validate_issue_packages(&issue["data"])?;
    }
    if !row.fast_forward {
        output.push(json!({
            "id":format!("{}@{}", row.identity.trim(), row.baseline.version.trim()),
            "issues":issues,
        }));
    }
    Ok(())
}

/// Validates that `data` is a non-empty array or JSON-encoded array of non-empty package names.
#[inline]
fn validate_issue_packages(data: &Value) -> io::Result<()> {
    if let Some(items) = data.as_array() {
        if items.is_empty() {
            return Err(invalid("command dependency issue packages"));
        }
        for item in items {
            let text = item
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("command dependency issue data"))?;
            if text.is_empty() {
                return Err(invalid("command dependency issue packages"));
            }
        }
        return Ok(());
    }
    let parsed: Vec<String> = serde_json::from_str(
        data.as_str().ok_or_else(|| invalid("command dependency issue data"))?,
    )
    .map_err(io::Error::other)?;
    if parsed.is_empty()
        || parsed
            .iter()
            .any(|item| item.trim().is_empty())
    {
        return Err(invalid("command dependency issue packages"));
    }
    Ok(())
}

/// Builds the dependency issue target descriptor for `row` from `state` and `issues`.
pub(super) fn target(row: &Row, state: &Value, issues: &Value) -> io::Result<Value> {
    let mut dependencies = Vec::new();
    let entries =
        state["entries"].as_array().ok_or_else(|| invalid("command issue dependency entries"))?;
    for field in projection::array(&state["components"])? {
        for index in projection::array(field)? {
            let index =
                index.as_u64().ok_or_else(|| invalid("command issue dependency index"))? as usize;
            let entry =
                entries.get(index).ok_or_else(|| invalid("command issue dependency index"))?;
            let identity = entry["identity"]
                .as_str()
                .or_else(|| entry["id"].as_str())
                .map(str::trim)
                .filter(|identity| !identity.is_empty())
                .ok_or_else(|| invalid("command issue dependency identity"))?;
            if !dependencies.contains(&identity) {
                dependencies.push(identity);
            }
        }
    }
    Ok(json!({
        "identity":format!("{}@{}", row.identity.trim(), row.baseline.version.trim()),
        "packageName":row.baseline.package_name.trim(),
        "dependencies":dependencies,
        "issues":issues,
    }))
}
