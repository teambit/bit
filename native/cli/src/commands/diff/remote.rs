//! Retain `scopeImporter.importWithoutDeps({cache:true,reason:"to show diff"})`.

use super::{options::Options, progress};
use crate::commands::{
    engine::Engine,
    status::js::{decline, text},
};
use serde_json::Value;
use std::{io, path::Path};

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
    let mut ids = Vec::new();
    for target in selected {
        let identity = text(
            target
                .get("identity")
                .or_else(|| target.get("id")),
        )?
        .trim();
        if !exported.iter().any(|id| id == identity) {
            continue;
        }
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
            ids.push(format!("{identity}@{version}"));
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
