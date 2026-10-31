use super::{bound, invalid, text};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    rows: Vec<Row>,
    queries: Vec<String>,
    #[serde(default)]
    exclude: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Row {
    id: String,
    dependencies: Vec<String>,
}
pub(super) fn index(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    bound(request.rows.len())?;
    bound(request.queries.len())?;
    bound(request.exclude.len())?;
    let incoming = incoming(&request.rows)?;
    output_budget(&request.queries, &incoming)?;
    for id in request.queries.iter().chain(&request.exclude) {
        text(id)?;
    }
    let excluded: HashSet<_> = request.exclude
        .iter()
        .map(|id| id.trim())
        .collect();
    let dependents: Vec<_> = request.queries
        .iter()
        .map(|id| {
            incoming
                .get(id.trim())
                .cloned()
                .unwrap_or_default()
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

fn incoming(rows: &[Row]) -> io::Result<HashMap<&str, Vec<&str>>> {
    let mut incoming: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut edges = 0;
    for row in rows {
        text(&row.id)?;
        let row_id = row.id.trim();
        for dependency in &row.dependencies {
            text(dependency)?;
            edges += 1;
            bound(edges)?;
            let entries = incoming.entry(dependency.trim()).or_default();
            if !entries.contains(&row_id) {
                entries.push(row_id);
            }
        }
    }
    Ok(incoming)
}
