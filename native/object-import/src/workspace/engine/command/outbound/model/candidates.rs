//! Pending main-lane identity metadata for export wildcard selection.
use super::{all_rows, invalid, staged_rows};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) fn read(root: &Path, all: bool) -> io::Result<Value> {
    let index: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(root).join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("outbound index"))?;
    let candidates = if all { all_rows(root, rows)? } else { staged_rows(root, rows)? };
    let ids = candidates
        .iter()
        .map(|(row, _)| {
            let scope =
                row["id"]["scope"].as_str().ok_or_else(|| invalid("outbound candidate scope"))?;
            let name =
                row["id"]["name"].as_str().ok_or_else(|| invalid("outbound candidate name"))?;
            Ok(format!("{scope}/{name}"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(json!({"ids":ids}))
}

/// Wildcard discovery computes divergence before applying the user's filter.
pub(super) fn histories(root: &Path) -> io::Result<Vec<super::HistoryBytes>> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap"))?)?;
    let index: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(root).join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("outbound index"))?;
    let dir = crate::scope_path(root).join("objects");
    let mut histories = Vec::new();
    for (row, model) in staged_rows(root, rows)? {
        let scope =
            row["id"]["scope"].as_str().ok_or_else(|| invalid("outbound candidate scope"))?;
        let name = row["id"]["name"].as_str().ok_or_else(|| invalid("outbound candidate name"))?;
        if !bitmap
            .as_object()
            .is_some_and(|rows| {
                rows.values()
                    .any(|row| {
                        row["name"] == name
                            && (row["scope"] == scope || row["defaultScope"] == scope)
                    })
            })
        {
            continue;
        }
        let head = model["head"].as_str().ok_or_else(|| invalid("outbound candidate head"))?;
        histories.push(super::prepare_history(&dir, scope, name, head)?);
    }
    Ok(histories)
}
