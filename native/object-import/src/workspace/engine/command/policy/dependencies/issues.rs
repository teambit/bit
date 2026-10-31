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
                .is_some_and(|kind| ignored.iter().any(|name| name == kind))
        })
        .cloned()
        .collect();
    if issues.is_empty() {
        return Ok(());
    }
    for issue in &issues {
        if issue["type"] != "MissingManuallyConfiguredPackages" {
            return Err(invalid("command unsupported merged dependency issue"));
        }
        let data = parse_issue_packages(&issue["data"])?;
        if data.is_empty() || data.iter().any(String::is_empty) {
            return Err(invalid("command dependency issue packages"));
        }
    }
    if !row.fast_forward {
        output.push(
            json!({"id":format!("{}@{}", row.identity, row.baseline.version),"issues":issues}),
        );
    }
    Ok(())
}

fn parse_issue_packages(data: &Value) -> io::Result<Vec<String>> {
    if let Some(items) = data.as_array() {
        return items
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::trim)
                    .map(str::to_owned)
                    .ok_or_else(|| invalid("command dependency issue data"))
            })
            .collect();
    }
    serde_json::from_str(data.as_str().ok_or_else(|| invalid("command dependency issue data"))?)
        .map_err(io::Error::other)
}

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
            dependencies.push(identity);
        }
    }
    Ok(
        json!({"identity":format!("{}@{}", row.identity, row.baseline.version),"packageName":row.baseline.package_name,"dependencies":dependencies,"issues":issues}),
    )
}
