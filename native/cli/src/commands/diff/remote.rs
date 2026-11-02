//! Retain `scopeImporter.importWithoutDeps({cache:true,reason:"to show diff"})` ([`prepare`]) via [`Options`] and [`Engine`].
//!
//! Returns `Ok(None)` when no exported comparison versions require remote fetching.

use super::{options::Options, progress};
use crate::commands::{
    engine::Engine,
    status::js::{decline, text},
};
use serde_json::Value;
use std::{io, path::Path};

/// Pushes `identity@version` strings for requested comparison versions in [`Options`] onto `ids`.
#[inline]
fn push_target_versions(target: &Value, identity: &str, options: &Options, ids: &mut Vec<String>) {
    let from = options.versions.from
        .as_deref()
        .or_else(|| target["version"].as_str())
        .or_else(|| target["head"].as_str());
    for version in [from, options.versions.to.as_deref()]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
    {
        let full_id = format!("{identity}@{version}");
        if !ids.contains(&full_id) {
            ids.push(full_id);
        }
    }
}

/// Prepares an `importWithoutDeps` refresh token when exported comparison versions need fetching.
pub(super) fn prepare(
    engine: &mut Engine,
    root: &Path,
    selected: &[Value],
    options: &Options,
) -> io::Result<Option<Value>> {
    if options.versions.from.is_none() && !options.versions.parent {
        return Ok(None);
    }
    let exported = progress::exported_ids(root);
    let mut ids = Vec::with_capacity(selected.len() * 2);
    for target in selected {
        let raw_id = text(
            target
                .get("identity")
                .or_else(|| target.get("id")),
        )?
        .trim();
        let identity = raw_id.rsplit_once('@').map_or(raw_id, |(base, _)| base.trim());
        if !identity.is_empty() && exported.iter().any(|id| id == identity) {
            push_target_versions(target, identity, options, &mut ids);
        }
    }
    if ids.is_empty() {
        return Ok(None);
    }
    let prepared = crate::commands::import::prepare_diff_refresh(engine, root, &ids)?;
    let token = prepared
        .get("token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| decline("diff import token"))?;
    Ok(Some(Value::String(token.to_owned())))
}
