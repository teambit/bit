#[cfg(test)]
mod tests;

use super::super::invalid;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

/// Reuse the independently qualified graphlib-compatible snapshot kernel.
/// Candidate order precedes selected order, just like workspace.getAutoTagInfo.
pub(super) fn reports(
    current: &[Value],
    components: &[super::projection::Component],
    selected: &[String],
    semver: &Value,
) -> io::Result<Vec<Value>> {
    let selected_set: HashSet<_> = selected
        .iter()
        .map(String::as_str)
        .collect();
    let ordered = ordered(current, selected, &selected_set)?;
    let rows = build_rows(&ordered, components)?;
    let changed = ordered
        .iter()
        .filter(|row| selected_set.contains(row["identity"].as_str().unwrap_or_default()))
        .map(|row| id(row))
        .collect::<io::Result<Vec<_>>>()?;
    let result = crate::snapshot_transaction::apply(
        "snapshotAutoTag",
        json!({"components":rows,"changed":changed,"semver":semver}),
        &mut crate::snapshot_transaction::State::default(),
    )?;
    result["results"]
        .as_array()
        .ok_or_else(|| invalid("resolve autotag result"))?
        .iter()
        .map(|row| {
            let identity = result_identity(row, &ordered)?;
            let triggers = row["triggeredBy"]
                .as_array()
                .ok_or_else(|| invalid("snap cascade triggers"))?
                .iter()
                .map(|locator| trigger(locator, &rows))
                .collect::<io::Result<Vec<_>>>()?;
            Ok(json!({"id":identity,"triggeredBy":triggers}))
        })
        .collect()
}

fn build_rows(
    ordered: &[&Value],
    components: &[super::projection::Component],
) -> io::Result<Vec<Value>> {
    ordered
        .iter()
        .map(|row| {
            let identity = row["identity"].as_str().unwrap_or_default();
            let pinned = components
                .iter()
                .find(|comp| comp.identity == identity)
                .map(super::projection::Component::pinned_from_config)
                .unwrap_or_default();
            component(row, &pinned)
        })
        .collect()
}

fn ordered<'a>(
    current: &'a [Value],
    selected: &[String],
    selected_set: &HashSet<&str>,
) -> io::Result<Vec<&'a Value>> {
    let mut ordered = current
        .iter()
        .filter(|row| !selected_set.contains(row["identity"].as_str().unwrap_or_default()))
        .collect::<Vec<_>>();
    for identity in selected {
        ordered.push(
            current
                .iter()
                .find(|row| row["identity"] == *identity)
                .ok_or_else(|| invalid("resolve changed capture absent"))?,
        );
    }
    Ok(ordered)
}

fn component(row: &Value, pinned: &HashSet<String>) -> io::Result<Value> {
    let mut dependencies = Vec::new();
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        for entry in row["current"][field]
            .as_array()
            .into_iter()
            .flatten()
        {
            if let Ok(identity) = super::selection::identity(&entry["id"])
                && pinned.contains(&identity)
            {
                continue;
            }
            dependencies.push(entry["id"].clone());
        }
    }
    dependencies.extend(
        row["current"]["extensions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|extension| {
                extension
                    .get("extensionId")
                    .or_else(|| extension.get("id"))
                    .filter(|val| !val.is_null())
                    .cloned()
            }),
    );
    Ok(json!({"id":id(row)?,"dependencies":dependencies}))
}

fn result_identity(row: &Value, ordered: &[&Value]) -> io::Result<String> {
    let index = row["component"].as_u64().ok_or_else(|| invalid("resolve autotag index"))? as usize;
    ordered
        .get(index)
        .and_then(|value| value["identity"].as_str())
        .map(str::trim)
        .filter(|identity| !identity.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| invalid("resolve autotag component"))
}

fn id(row: &Value) -> io::Result<Value> {
    let identity = row["identity"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("resolve capture identity"))?;
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| invalid("resolve scoped identity"))?;
    let version = row["version"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("resolve capture version"))?;
    Ok(if version.is_empty() {
        json!({"scope":scope,"name":name})
    } else {
        json!({"scope":scope,"name":name,"version":version})
    })
}

fn trigger(locator: &Value, rows: &[Value]) -> io::Result<String> {
    let index =
        locator["component"].as_u64().ok_or_else(|| invalid("snap trigger component"))? as usize;
    let row = rows.get(index).ok_or_else(|| invalid("snap trigger row"))?;
    let id = if locator["kind"] == "component" {
        &row["id"]
    } else {
        let index =
            locator["index"].as_u64().ok_or_else(|| invalid("snap trigger dependency"))? as usize;
        row["dependencies"]
            .as_array()
            .and_then(|values| values.get(index))
            .ok_or_else(|| invalid("snap trigger dependency index"))?
    };
    let identity = super::selection::identity(id)?;
    let version = id["version"]
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .or_else(|| {
            id.as_str()
                .and_then(|raw| raw.rsplit_once('@').map(|(_, ver)| ver.trim()))
                .filter(|version| !version.is_empty())
        });
    Ok(match version {
        Some(version) => format!("{identity}@{version}"),
        None => identity,
    })
}
