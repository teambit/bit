//! Native root collation with an `Intl` presentation adapter for tailored locales.
//!
//! [`sort_rows`] uses [`collate`] when supported or falls back to [`Host`] locale sorting.

use super::{
    collate,
    js::{decline, text},
};
use crate::{
    discovery::{self, Target},
    host::Host,
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

/// Sorts each component array in `result` using [`collate`] root collation or `Intl` host collation.
pub(super) fn sort_rows(root: &Path, result: &mut Value) -> io::Result<()> {
    let mut host = None;
    let result = result.as_object_mut().ok_or_else(|| decline("status result"))?;
    for (key, rows) in result.iter_mut() {
        if matches!(key.as_str(), "importPendingComponents" | "workspaceIssues") {
            continue;
        }
        let Some(rows) = rows.as_array_mut() else {
            continue;
        };
        if rows.len() < 2 {
            if let Some(first) = rows.first() {
                sort_id(first)?;
            }
            continue;
        }
        let ids = rows
            .iter()
            .map(sort_id)
            .collect::<io::Result<Vec<_>>>()?;
        let order = order(root, &ids, &mut host)?;
        *rows = order
            .into_iter()
            .map(|index| rows[index].clone())
            .collect();
    }
    Ok(())
}

/// Computes the sorted index permutation for `ids` via [`collate`] or the `collationOrder` host RPC.
fn order(root: &Path, ids: &[String], host: &mut Option<Host>) -> io::Result<Vec<usize>> {
    let mut order = (0..ids.len()).collect::<Vec<_>>();
    if ids.len() < 2 {
        return Ok(order);
    }
    if collate::root_locale() && ids.iter().all(|id| collate::supported(id)) {
        order.sort_by(|&left, &right| collate::compare(&ids[left], &ids[right]));
        return Ok(order);
    }
    if host.is_none() {
        let Target::Entry(cli) = discovery::find()? else {
            return Err(decline("locale presentation needs installed Node"));
        };
        *host = Some(Host::new(cli, root.to_owned(), false));
    }
    let host = host.as_ref().ok_or_else(|| decline("locale presentation adapter"))?;
    let result = host.call("collationOrder", &json!({"ids":ids}))?;
    permutation(&result, ids.len())
}

/// Validates and converts a JSON index array `result` into a bijective `0..count` permutation.
#[inline]
fn permutation(result: &Value, count: usize) -> io::Result<Vec<usize>> {
    let result = result.as_array().ok_or_else(|| decline("locale presentation order"))?;
    let order = result
        .iter()
        .map(|index| {
            index
                .as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .filter(|&index| index < count)
                .ok_or_else(|| decline("locale presentation index"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if order.len() != count
        || order
            .iter()
            .collect::<HashSet<_>>()
            .len()
            != count
    {
        return Err(decline("locale presentation permutation"));
    }
    Ok(order)
}

/// Extracts the trimmed component identity string used for sorting a status `row` [`Value`].
#[inline]
fn sort_id(row: &Value) -> io::Result<String> {
    if let Value::String(id) = row {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err(decline("status sort id is empty"));
        }
        return Ok(trimmed.to_owned());
    }
    let str_field = |key: &str| {
        row.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    };
    if let Some(id) = str_field("id").or_else(|| str_field("identity")) {
        return Ok(id.to_owned());
    }
    let object = row["id"].as_object().ok_or_else(|| decline("status expected a string"))?;
    let name = text(object.get("name"))?.trim();
    if name.is_empty() {
        return Err(decline("status sort id name is empty"));
    }
    match object
        .get("scope")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => Ok(format!("{scope}/{name}")),
        None => Ok(name.to_owned()),
    }
}
