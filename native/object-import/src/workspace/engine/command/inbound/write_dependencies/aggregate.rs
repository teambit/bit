//! Resolver policy precedence ([`prepare`]) and npm `minVersion` range deduplication.

#[cfg(test)]
mod tests;
use super::invalid;
use node_semver::npm;
use serde_json::{Map, Value, json};
use std::{cmp::Ordering, collections::HashSet, io};

/// Aggregates and deduplicates dependency ranges across root, variant ([`policy_rows`]), and component ([`component_rows`]) policies via [`dedupe`].
pub(super) fn prepare(facts: &Value) -> io::Result<Map<String, Value>> {
    let root_entries = array(&facts["rootPolicy"]["entries"])?;
    let mut rows = Vec::with_capacity(root_entries.len());
    let mut root_names = HashSet::with_capacity(root_entries.len());
    for entry in root_entries {
        if let Some(name) = entry["dependencyId"].as_str().map(str::trim) {
            root_names.insert(name);
        }
        push(
            &mut rows,
            json!({"name":entry["dependencyId"],"range":entry["value"]["version"],"root":true}),
        )?;
    }
    let variants = facts["variantPoliciesByPatterns"]
        .as_object()
        .ok_or_else(|| invalid("inbound variant policies"))?;
    for policy in variants.values() {
        policy_rows(policy, &mut rows)?;
    }
    for component in array(&facts["componentPolicies"])? {
        policy_rows(&component["policy"], &mut rows)?;
    }
    component_rows(facts, &root_names, &mut rows)?;
    dedupe(&rows)
}

/// Appends `dependencies`, `devDependencies`, and `peerDependencies` entries from `policy` into `rows` for [`prepare`].
fn policy_rows(policy: &Value, rows: &mut Vec<Value>) -> io::Result<()> {
    if policy.is_null() {
        return Ok(());
    }
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(entries) = policy[field].as_object() else { continue };
        policy_entries(entries, rows)?;
    }
    Ok(())
}

/// Collects non-extension, non-peer external npm dependency ranges from `facts["components"]`.
fn component_rows(
    facts: &Value,
    root_names: &HashSet<&str>,
    rows: &mut Vec<Value>,
) -> io::Result<()> {
    let components = array(&facts["components"])?;
    let local = components
        .iter()
        .filter_map(|row| {
            row["packageName"]
                .as_str()
                .map(str::trim)
                .filter(|name| !name.is_empty())
        })
        .collect::<HashSet<_>>();
    for component in components {
        for dependency in array(&component["dependencies"])? {
            let Some(name) = dependency["name"]
                .as_str()
                .map(str::trim)
                .filter(|name| !name.is_empty())
            else {
                continue;
            };
            let Some(version) = dependency["version"]
                .as_str()
                .map(str::trim)
                .filter(|ver| !ver.is_empty())
            else {
                continue;
            };
            if dependency["isExtension"] == true
                || dependency["lifecycleType"].as_str().map(str::trim) == Some("peer")
                || local.contains(name)
                || root_names.contains(name)
                || npm::valid_range(version).is_none()
            {
                continue;
            }
            push(rows, json!({"name":name,"range":version,"root":false}))?;
        }
    }
    Ok(())
}

/// Deduplicates collected dependency `rows`, preferring root policy ranges and newer `minVersion` ranges.
fn dedupe(rows: &[Value]) -> io::Result<Map<String, Value>> {
    if rows.len() > 65536 {
        return Err(invalid("inbound dependency policy limit"));
    }
    let mut selected = Map::<String, Value>::new();
    for row in rows {
        let name = row["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("inbound dependency name"))?;
        let incoming = row["range"]
            .as_str()
            .map(str::trim)
            .filter(|range| !range.is_empty())
            .ok_or_else(|| invalid("inbound dependency range"))?;
        let replace = match selected.get(name) {
            None => true,
            Some(old) if old["range"].as_str().map(str::trim) == Some(incoming) => false,
            Some(old) => overwrite(old, row)?,
        };
        if replace {
            selected.insert(
                name.into(),
                json!({"name": name, "range": incoming, "root": row["root"] == true}),
            );
        }
    }
    let mut selected = selected.into_iter().collect::<Vec<_>>();
    selected.sort_by_key(|(name, _)| array_index(name).map_or((1, 0), |index| (0, index)));
    Ok(selected
        .into_iter()
        .map(|(name, row)| (name, row["range"].clone()))
        .collect())
}

fn overwrite(old: &Value, incoming: &Value) -> io::Result<bool> {
    if old["root"] == true && incoming["root"] != true {
        return Ok(false);
    }
    if old["root"] != true && incoming["root"] == true {
        return Ok(true);
    }
    let incoming_range = incoming["range"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("inbound dependency range"))?;
    let old_range = old["range"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("inbound dependency range"))?;
    let left =
        npm::min_version(incoming_range).map_err(|_| invalid("inbound invalid dependency range"))?;
    let right =
        npm::min_version(old_range).map_err(|_| invalid("inbound invalid dependency range"))?;
    Ok(left
        .zip(right)
        .is_some_and(|(left, right)| left.compare(&right) == Ordering::Greater))
}
#[inline]
fn array(value: &Value) -> io::Result<&[Value]> {
    value
        .as_array()
        .filter(|rows| rows.len() <= 16384)
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("inbound dependency metadata array"))
}

fn push(rows: &mut Vec<Value>, row: Value) -> io::Result<()> {
    if rows.len() >= 65536 {
        return Err(invalid("inbound dependency policy limit"));
    }
    rows.push(row);
    Ok(())
}

#[inline]
fn array_index(name: &str) -> Option<u32> {
    let name = name.trim();
    if name != "0" && (name.starts_with('0') || !name.bytes().all(|byte| byte.is_ascii_digit())) {
        return None;
    }
    name.parse::<u32>()
        .ok()
        .filter(|&index| index != u32::MAX)
}

fn policy_entries(entries: &Map<String, Value>, rows: &mut Vec<Value>) -> io::Result<()> {
    for (name, value) in entries {
        let range = if value.is_string() { value } else { &value["version"] };
        if range.as_str().map(str::trim) == Some("-") {
            continue;
        }
        push(rows, json!({"name":name.trim(),"range":range,"root":false}))?;
    }
    Ok(())
}
