//! Pending main-lane identity metadata via [`read`], [`histories`], and [`candidate_scope_and_name`] for export wildcard selection.

use super::{all_rows, invalid, staged_rows};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

/// Reads candidate component IDs (`scope/name`) from `index.json` via [`staged_rows`], [`all_rows`], and [`candidate_scope_and_name`].
#[inline]
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

/// Wildcard discovery computes `VersionHistory` divergence via [`staged_rows`] and [`candidate_scope_and_name`] before applying the user's filter.
pub(super) fn histories(root: &Path) -> io::Result<Vec<super::HistoryBytes>> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap"))?)?;
    let index: Value = crate::parse_jsonc(&fs::read(crate::scope_path(root).join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("outbound index"))?;
    let dir = crate::scope_path(root).join("objects");
    let staged = staged_rows(root, rows)?;
    let mut histories = Vec::with_capacity(staged.len());
    for (row, model) in staged {
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

/// Extracts and validates the non-empty `(scope, name)` pair from an index component `row` for [`read`] and [`histories`].
#[inline]
fn candidate_scope_and_name(row: &Value) -> io::Result<(&str, &str)> {
    let (scope_opt, name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .ok_or_else(|| invalid("outbound candidate name"))?;
    let name = name.trim();
    if name.is_empty()
        || name.contains('\\')
        || name.chars().any(char::is_control)
        || name
            .split('/')
            .any(|seg| seg.trim().is_empty() || matches!(seg.trim(), "." | ".."))
    {
        return Err(invalid("outbound candidate name"));
    }
    let scope = scope_opt
        .map(str::trim)
        .filter(|val| {
            !val.is_empty()
                && !matches!(*val, "." | "..")
                && !val.contains(['/', '\\'])
                && !val.chars().any(char::is_control)
        })
        .ok_or_else(|| invalid("outbound candidate scope"))?;
    Ok((scope, name))
}
