//! Remote wildcard pattern resolution ([`ids`], [`Options`], [`Engine`], [`matched`]) for `bit fork`.

use super::{invalid, matched};
use crate::commands::{
    engine::Engine, fork::options::Options, patterns, status::cache::cache_root,
    workspace_command::NodeCli,
};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Lists and filters remote scope component IDs matching `options` for `bit fork` or `bit scope fork`.
pub(super) fn ids(root: &Path, options: &Options) -> io::Result<Vec<String>> {
    let scope_list = scopes(options);
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::with_capacity(scope_list.len());
    for scope in scope_list {
        if !seen.insert(scope.clone()) {
            continue;
        }
        let ids = match list(root, &scope) {
            Ok(ids) => ids,
            Err(error) if options.scope_fork => return Err(error),
            Err(_) => continue,
        };
        result.extend(if let Some(pattern) = pattern(options, &scope) {
            matched(&ids, &pattern)?
        } else {
            ids
        });
    }
    Ok(result)
}
/// Extracts the literal remote scope prefixes referenced by `options`.
#[inline]
fn scopes(options: &Options) -> Vec<String> {
    if options.scope_fork {
        return vec![options.source.trim().to_owned()];
    }
    patterns::split(&options.source)
        .into_iter()
        .filter(|pattern| !pattern.starts_with(['!', '$']))
        .filter_map(|pattern| {
            let (scope, _) = pattern.trim().split_once('/')?;
            let scope = scope.trim();
            (!scope.is_empty() && !scope.contains(['*', '?', '{', '}'])).then(|| scope.to_owned())
        })
        .collect()
}
/// Builds the scope-qualified pattern string for filtering remote components in `scope`.
#[inline]
fn pattern(options: &Options, scope: &str) -> Option<String> {
    if !options.scope_fork {
        return Some(options.source.clone());
    }
    let scope = scope.trim();
    options.pattern
        .as_ref()
        .map(|pattern| {
            patterns::split(pattern)
                .iter()
                .filter_map(|part| qualify_scope_part(part, scope))
                .collect::<Vec<_>>()
                .join(",")
        })
        .filter(|joined| !joined.is_empty())
}
/// Prefixes a comma-separated pattern segment `part` with `scope/` when not already qualified.
#[inline]
fn qualify_scope_part(part: &str, scope: &str) -> Option<String> {
    let trimmed = part.trim();
    let (prefix, body) = trimmed
        .strip_prefix('!')
        .map_or(("", trimmed), |rest| ("!", rest.trim()));
    if body.is_empty() {
        return None;
    }
    let already_qualified = body
        .strip_prefix(scope)
        .is_some_and(|rest| rest.starts_with('/'));
    if already_qualified {
        Some(format!("{prefix}{body}"))
    } else {
        Some(format!("{prefix}{scope}/{body}"))
    }
}
fn list(root: &Path, scope: &str) -> io::Result<Vec<String>> {
    let cli = NodeCli::find()?;
    let response: Value=Engine::new()?.request(&json!({"kind":"commandInboundList","root":root,"globalConfigDir":cache_root().join("config"),"nodeExecutable":cli.node,"bitDir":cli.bit_dir,"bitVersion":cli.version,"patterns":[format!("{scope}/**")],"laneOnly":false,"forkOrder":true}))?;
    let ids = response["lists"][0]["components"]
        .as_array()
        .ok_or_else(|| invalid("fork remote list"))?
        .iter()
        .map(row_identity)
        .collect::<io::Result<Vec<_>>>()?;
    Ok(ids)
}

#[inline]
fn non_empty_str(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

#[inline]
fn row_identity(row: &Value) -> io::Result<String> {
    if let Some(id) = non_empty_str(&row["id"]).or_else(|| non_empty_str(&row["identity"])) {
        return Ok(id.to_owned());
    }
    let name = non_empty_str(&row["id"]["name"])
        .or_else(|| non_empty_str(&row["name"]))
        .ok_or_else(|| invalid("fork remote identity"))?;
    Ok(non_empty_str(&row["id"]["scope"])
        .or_else(|| non_empty_str(&row["scope"]))
        .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}")))
}
