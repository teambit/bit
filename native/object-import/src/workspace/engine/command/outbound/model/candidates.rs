//! Pending main-lane identity metadata for export wildcard selection.
use super::{all_rows, invalid, staged_rows};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) fn read(root: &Path, all: bool) -> io::Result<Value> {
    let index: Value = crate::parse_jsonc(&fs::read(crate::scope_path(root).join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("outbound index"))?;
    let candidates = if all { all_rows(root, rows)? } else { staged_rows(root, rows)? };
    let ids = candidates
        .iter()
        .map(|(row, _)| {
            let (scope, name) = candidate_scope_and_name(row)?;
            Ok(format!("{scope}/{name}"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(json!({"ids":ids}))
}

/// Wildcard discovery computes divergence before applying the user's filter.
pub(super) fn histories(root: &Path) -> io::Result<Vec<super::HistoryBytes>> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap"))?)?;
    let index: Value = crate::parse_jsonc(&fs::read(crate::scope_path(root).join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("outbound index"))?;
    let dir = crate::scope_path(root).join("objects");
    let mut histories = Vec::new();
    for (row, model) in staged_rows(root, rows)? {
        let (scope, name) = candidate_scope_and_name(&row)?;
        if !super::super::publication::reconcile_present(&bitmap, scope, name) {
            continue;
        }
        let head = model["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .ok_or_else(|| invalid("outbound candidate head"))?;
        histories.push(super::prepare_history(&dir, scope, name, head)?);
    }
    Ok(histories)
}

fn candidate_scope_and_name(row: &Value) -> io::Result<(&str, &str)> {
    let (scope_opt, name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .ok_or_else(|| invalid("outbound candidate name"))?;
    let scope = scope_opt
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("outbound candidate scope"))?;
    Ok((scope, name))
}
