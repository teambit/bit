//! Reverse dependency index construction ([`index`], [`Request`]) and dependent filtering for `bit reset`.

use super::{bound, invalid, text};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};
/// Deserialized `historyResetDependents` request payload (`rows`, `queries`, `exclude`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    rows: Vec<Row>,
    queries: Vec<String>,
    #[serde(default)]
    exclude: Vec<String>,
}
/// Single component row with its outgoing `dependencies` for reverse-index construction.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Row {
    id: String,
    dependencies: Vec<String>,
}
/// Builds the reverse dependency index for `input` and resolves dependent and outside sets.
pub(super) fn index(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    bound(request.rows.len())?;
    bound(request.queries.len())?;
    bound(request.exclude.len())?;
    for id in request.queries.iter().chain(&request.exclude) {
        text(id)?;
    }
    let incoming = incoming(&request.rows)?;
    output_budget(&request.queries, &incoming)?;
    let excluded: HashSet<_> = request.exclude
        .iter()
        .map(|id| id.trim())
        .collect();
    let dependents: Vec<&[&str]> = request.queries
        .iter()
        .map(|id| {
            incoming
                .get(id.trim())
                .map_or(&[][..], Vec::as_slice)
        })
        .collect();
    let outside: Vec<Vec<_>> = dependents
        .iter()
        .map(|rows| {
            rows.iter()
                .filter(|id| !excluded.contains(**id))
                .copied()
                .collect()
        })
        .collect();
    Ok(json!({"dependents":dependents,"outside":outside}))
}
/// Verifies that the serialized dependent list response for `queries` stays within the 4 MiB budget.
fn output_budget(queries: &[String], incoming: &HashMap<&str, Vec<&str>>) -> io::Result<()> {
    let mut total = 256_usize.saturating_add(queries.len().saturating_mul(8));
    for query in queries {
        let Some(rows) = incoming.get(query.trim()) else {
            continue;
        };
        for row in rows {
            let entry_cost = row
                .len()
                .checked_mul(12)
                .and_then(|val| val.checked_add(8))
                .ok_or_else(|| invalid("dependency response overflow"))?;
            total = total
                .checked_add(entry_cost)
                .ok_or_else(|| invalid("dependency response overflow"))?;
            if total > 4 * 1024 * 1024 {
                return Err(invalid("dependency response limit"));
            }
        }
    }
    Ok(())
}

/// Constructs a reverse dependency map from component IDs to their deduplicated incoming dependent IDs.
fn incoming(rows: &[Row]) -> io::Result<HashMap<&str, Vec<&str>>> {
    let mut incoming: HashMap<&str, Vec<&str>> = HashMap::with_capacity(rows.len());
    let mut edges = 0;
    for row in rows {
        text(&row.id)?;
        bound(row.dependencies.len())?;
        let row_id = row.id.trim();
        for dependency in &row.dependencies {
            text(dependency)?;
            edges += 1;
            bound(edges)?;
            let dep_id = dependency.trim();
            if dep_id == row_id {
                continue;
            }
            let entries = incoming.entry(dep_id).or_default();
            if !entries.contains(&row_id) {
                entries.push(row_id);
            }
        }
    }
    Ok(incoming)
}
