//! Cached dependency issue extraction via [`missing`] and post-policy missing-package updates.

use super::invalid;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

/// Component issue class name for missing filesystem packages (`MissingPackagesDependenciesOnFs`).
const MISSING: &str = "MissingPackagesDependenciesOnFs";
/// Component issue class name for missing manually configured packages (`MissingManuallyConfiguredPackages`).
const MANUAL: &str = "MissingManuallyConfiguredPackages";

/// Extracts [`MISSING`] filesystem package records from cached `issues` ([`Value`]).
pub(super) fn missing(issues: &Value) -> io::Result<Vec<Value>> {
    let mut seen = HashSet::new();
    let mut missing = Vec::new();
    for issue in rows(issues)? {
        let name = issue["type"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("status cached issue name"))?;
        if !seen.insert(name) {
            return Err(invalid("status duplicate cached issue"));
        }
        let data = issue["data"]
            .as_str()
            .map(str::trim)
            .filter(|data| !data.is_empty())
            .ok_or_else(|| invalid("status cached issue data"))?;
        if name == MISSING {
            let data: Value = serde_json::from_str(data).map_err(io::Error::other)?;
            for row in rows(&data)? {
                missing.push(
                    json!({"isDevFile":row["isDevFile"],"missingPackages":row["missingPackages"]}),
                );
            }
        }
    }
    Ok(missing)
}

/// Updates cached dependency `issues` with post-policy missing filesystem and manual packages from `output`.
pub(super) fn apply(issues: &Value, output: &Value) -> io::Result<Value> {
    let mut result = Vec::new();
    for issue in rows(issues)? {
        if issue["type"].as_str().map(str::trim) != Some(MISSING) {
            result.push(issue.clone());
            continue;
        }
        let data: Value = serde_json::from_str(
            issue["data"]
                .as_str()
                .map(str::trim)
                .filter(|data| !data.is_empty())
                .ok_or_else(|| invalid("status cached missing issue"))?,
        )
        .map_err(io::Error::other)?;
        let mut updated = Vec::new();
        let detected_missing = rows(&output["detectedMissing"])?;
        for (index, row) in rows(&data)?.iter().enumerate() {
            let packages = detected_missing
                .get(index)
                .ok_or_else(|| invalid("status cached missing issue"))?;
            if !rows(packages)?.is_empty() {
                let mut row = row.clone();
                row["missingPackages"] = packages.clone();
                updated.push(row);
            }
        }
        if !updated.is_empty() {
            result.push(serialized(MISSING, &json!(updated))?);
        }
    }
    add_manual(&mut result, &output["missing"])?;
    Ok(Value::Array(result))
}

#[inline]
fn add_manual(issues: &mut Vec<Value>, missing: &Value) -> io::Result<()> {
    let mut seen = HashSet::new();
    let values: Vec<_> = rows(missing)?
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty() && seen.insert(*name))
        .map(|name| json!(name))
        .collect();
    if values.is_empty() {
        return Ok(());
    }
    let replacement = serialized(MANUAL, &json!(values))?;
    if let Some(issue) = issues
        .iter_mut()
        .find(|issue| issue["type"].as_str().map(str::trim) == Some(MANUAL))
    {
        *issue = replacement;
    } else {
        issues.push(replacement);
    }
    Ok(())
}
#[inline]
fn serialized(name: &str, data: &Value) -> io::Result<Value> {
    Ok(json!({"type":name,"data":serde_json::to_string(data).map_err(io::Error::other)?}))
}
#[inline]
fn rows(value: &Value) -> io::Result<&[Value]> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("status cached issue rows"))
}
