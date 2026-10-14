//! The engine's outbound receipts and
//! `ExportCmd.report` for the exports that run natively: components only,
//! without lanes, ejecting or ripple jobs.

use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
    workspace_command::format::Formatter,
};
use serde_json::Value;
use std::{collections::HashSet, io};

/// `commandOutboundPrepare`'s receipt.
pub(super) struct Prepared {
    pub token: String,
    pub nothing_to_export: bool,
    pub count: usize,
    pub scopes: Vec<String>,
    /// Each scope and the objects pushed to it.
    pub transfers: Vec<(String, usize)>,
}

/// The prepared export, which must own a token, name its scopes and count
/// the objects of each.
pub(super) fn prepared(value: &Value) -> io::Result<Prepared> {
    let token = text(value.get("token"))?;
    let nothing_to_export = value["nothingToExport"]
        .as_bool()
        .ok_or_else(|| decline("native outbound prepare receipt"))?;
    let count = value["componentCount"]
        .as_u64()
        .and_then(|count| usize::try_from(count).ok())
        .ok_or_else(|| decline("native outbound component count"))?;
    let scopes = array(value.get("scopes"), "scopes")?
        .iter()
        .map(|scope| text(Some(scope)).map(str::to_string))
        .collect::<io::Result<Vec<_>>>()?;
    let counts = array(value.get("scopeObjectCounts"), "object counts")?;
    if value["owner"] != "rust"
        || token.is_empty()
        || counts.len() != scopes.len()
        || scopes.iter().any(String::is_empty)
        || nothing_to_export != (count == 0)
    {
        return Err(decline("native outbound prepare receipt"));
    }
    let transfers = scopes
        .iter()
        .zip(counts)
        .map(|(scope, objects)| {
            let objects = objects
                .as_u64()
                .and_then(|objects| usize::try_from(objects).ok())
                .ok_or_else(|| decline("native outbound object count"))?;
            Ok((scope.clone(), objects))
        })
        .collect::<io::Result<_>>()?;
    Ok(Prepared { token: token.to_string(), nothing_to_export, count, scopes, transfers })
}

/// `commandOutboundFinalize`'s receipt, validated.
pub(super) fn published(value: &Value, token: &str) -> io::Result<Value> {
    let map = object(value)?;
    if map.get("applied") != Some(&Value::Bool(true))
        || value["token"] != token
        || value["owner"] != "rust"
    {
        return Err(decline("native outbound finalize receipt"));
    }
    for field in
        ["componentsIds", "newIdsOnRemote", "nonExistOnBitMap", "removedIds", "missingScope"]
    {
        scoped_ids(value, field)?;
    }
    // `nonExistOnBitMap` and `missingScope` have sections the native report
    // does not render; the engine reports neither.
    for field in ["exportedLanes", "rippleJobUrls", "nonExistOnBitMap", "missingScope"] {
        if !array(value.get(field), field)?.is_empty() {
            return Err(decline("native outbound unsupported receipt"));
        }
    }
    remote_ids(value)?;
    Ok(value.clone())
}

/// A receipt field of at most 4096 ids, each with a scope.
fn scoped_ids(value: &Value, field: &str) -> io::Result<()> {
    let ids = array(value.get(field), field)?;
    if ids.len() > 4096 {
        return Err(decline("native outbound identities"));
    }
    for id in ids {
        if Id::parse(text(Some(id))?)?.scope().is_empty() {
            return Err(decline("native outbound identity"));
        }
    }
    Ok(())
}

/// The exported components, unique and without versions, and each remote id
/// a version of one of them.
fn remote_ids(value: &Value) -> io::Result<()> {
    let mut components = HashSet::new();
    for id in array(value.get("componentsIds"), "components")? {
        let id = text(Some(id))?;
        if id.contains('@') || !components.insert(id) {
            return Err(decline("native outbound component identity"));
        }
    }
    for id in array(value.get("newIdsOnRemote"), "remote ids")? {
        let id = Id::parse(text(Some(id))?)?;
        if !id.has_version() || !components.contains(id.without_version().as_str()) {
            return Err(decline("native outbound remote identity"));
        }
    }
    Ok(())
}

/// `ExportCmd.report` without lanes, ejecting, ripple jobs or `--verbose`.
/// The receipt is a validated one (`published`).
pub(super) fn format(receipt: &Value, chalk: Chalk) -> String {
    let ids = |field: &str| -> Vec<&str> {
        receipt[field]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect()
    };
    let components = ids("componentsIds");
    let removed = ids("removedIds");
    if components.is_empty() {
        return chalk.yellow("nothing to export");
    }
    let format = Formatter::new(chalk);
    let items: Vec<String> = components
        .iter()
        .map(|id| format.item(&chalk.bold(id)))
        .collect();
    let exported =
        format.section("exported components", "exported the following component(s)", &items);
    let removed: Vec<String> = removed
        .iter()
        .map(|id| Formatter::item_with(id, &format.warn_symbol()))
        .collect();
    let removed = format.section("components removed on the remote", "", &removed);
    Formatter::join(&[exported, removed])
}

#[cfg(test)]
mod report_tests;
