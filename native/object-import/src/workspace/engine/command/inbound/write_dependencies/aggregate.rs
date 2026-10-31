//! Resolver policy precedence and npm `minVersion` range deduplication.
#[cfg(test)]
mod tests;
use super::invalid;
use node_semver::npm;
use serde_json::{Map, Value, json};
use std::{cmp::Ordering, collections::HashSet, io};

pub(super) fn prepare(facts: &Value) -> io::Result<Map<String, Value>> {
    let mut rows = Vec::new();
    for entry in array(&facts["rootPolicy"]["entries"])? {
        push(
            &mut rows,
            json!({"name":entry["dependencyId"],"range":entry["value"]["version"],"root":true}),
        )?;
    }
    let root_names = rows
        .iter()
        .map(|row| row["name"].clone())
        .collect::<Vec<_>>();
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

fn component_rows(facts: &Value, root_names: &[Value], rows: &mut Vec<Value>) -> io::Result<()> {
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
                || dependency["lifecycleType"] == "peer"
                || local.contains(name)
                || root_names
                    .iter()
                    .any(|value| value.as_str().map(str::trim) == Some(name))
                || npm::valid_range(version).is_none()
            {
                continue;
            }
            push(rows, json!({"name":name,"range":version,"root":false}))?;
        }
    }
    Ok(())
}

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
            .ok_or_else(|| invalid("inbound dependency range"))?;
        let replace = match selected.get(name) {
            None => true,
            Some(old) if old["range"].as_str().map(str::trim) == Some(incoming) => false,
            Some(old) => overwrite(old, row)?,
        };
        if replace {
            selected.insert(name.into(), row.clone());
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

fn array_index(name: &str) -> Option<u32> {
    let name = name.trim();
    let index = name.parse::<u32>().ok()?;
    (index != u32::MAX && index.to_string() == name).then_some(index)
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
