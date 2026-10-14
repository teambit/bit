//! `getBitIdsForNonLanes`: the ids `bit import` fetches, with each wildcard
//! pattern listed on its remote (`Lister.getRemoteCompIdsByWildcards`).

use super::options::{Options, has_wildcard};
use crate::commands::{
    engine::Engine,
    status::{
        cache::cache_root,
        collate,
        js::{array, decline, text},
    },
    workspace_command::NodeCli,
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

/// The ids to import, and a `NoIdMatchWildcard` message per pattern that
/// matched nothing.
pub struct Selection {
    pub ids: Vec<String>,
    pub warnings: Vec<String>,
}

/// The explicit ids, and each pattern's listed components without the
/// deprecated ones unless `--include-deprecated`, in `sortListScopeResults`
/// order. Duplicates are dropped, as `ComponentIdList.uniqFromArray` does.
pub fn select(root: &Path, options: &Options) -> io::Result<Selection> {
    let wildcards = options.wildcards();
    if wildcards.is_empty() {
        return Ok(Selection { ids: options.ids.clone(), warnings: Vec::new() });
    }
    if !collate::root_locale() {
        return Err(decline("a locale whose collation tailors id characters"));
    }
    let lists = list(root, &wildcards)?;
    let mut lists = lists.iter();
    let mut selection = Selection { ids: Vec::new(), warnings: Vec::new() };
    let mut seen = HashSet::new();
    for pattern in &options.ids {
        let ids = if has_wildcard(pattern) {
            let list = lists.next().ok_or_else(|| decline("remote lists"))?;
            listed(pattern, list, options.include_deprecated)?
        } else {
            vec![pattern.clone()]
        };
        if ids.is_empty() {
            selection.warnings.push(format!(
                "unable to find component ids that match the following: {pattern}",
            ));
        }
        selection.ids.extend(
            ids.into_iter()
                .filter(|id| seen.insert(id.clone())),
        );
    }
    Ok(selection)
}

/// The ids `pattern`'s list holds, in `sortListScopeResults` order.
fn listed(pattern: &str, list: &Value, include_deprecated: bool) -> io::Result<Vec<String>> {
    if list.get("pattern").and_then(Value::as_str) != Some(pattern) {
        return Err(decline("remote list pattern"));
    }
    let mut ids = matched(list, include_deprecated)?;
    ids.sort_by(|left, right| collate::compare(left, right));
    Ok(ids)
}

/// `commandInboundList`: each pattern with the components its remote lists.
fn list(root: &Path, patterns: &[&String]) -> io::Result<Vec<Value>> {
    let cli = NodeCli::find()?;
    let listed: Value = Engine::new()?
        .request(&json!({
            "kind": "commandInboundList",
            "root": root,
            "globalConfigDir": cache_root().join("config"),
            "nodeExecutable": cli.node,
            "bitDir": cli.bit_dir,
            "bitVersion": cli.version,
            "patterns": patterns,
        }))?;
    let lists = array(listed.get("lists"), "remote lists")?.to_vec();
    if lists.len() != patterns.len() {
        return Err(decline("remote lists"));
    }
    Ok(lists)
}

/// The listed ids, with their versions.
fn matched(list: &Value, include_deprecated: bool) -> io::Result<Vec<String>> {
    let mut ids = Vec::new();
    for component in array(list.get("components"), "remote list components")? {
        let id = text(component.get("id"))?;
        if !collate::supported(id) || !id.contains('@') {
            return Err(decline("remote list id"));
        }
        if include_deprecated || component.get("deprecated") != Some(&Value::Bool(true)) {
            ids.push(id.to_string());
        }
    }
    Ok(ids)
}
