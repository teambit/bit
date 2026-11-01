//! `getRemoteBitIdsToRemove` ([`Context`]): literal IDs or a remote wildcard inventory.

#[cfg(test)]
mod tests;

use super::Context;
use bit_client_transfer::remotes::Remote;
use serde_json::Value;
use std::{fs, io};

pub(super) fn components(context: &Context, pattern: &str) -> io::Result<Vec<String>> {
    let pattern = pattern.trim();
    if !pattern.contains('*') {
        return literal(pattern);
    }
    let (scope, name) = pattern
        .split_once('/')
        .ok_or_else(|| {
            invalid("import with wildcards expects full scope-name before the wildcards")
        })?;
    let (scope, name) = (scope.trim(), name.trim());
    if scope.is_empty()
        || name.is_empty()
        || scope.contains('*')
        || scope.contains("..")
        || name.contains("..")
    {
        return Err(invalid("remote wildcard scope"));
    }
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let remote = runtime.block_on(context.remotes.resolve(scope, &context.network))?;
    let mut ids: Vec<String> = inventory(context, &runtime, remote, name)?
        .into_iter()
        .filter_map(|id| match_wildcard_inventory_id(id, scope, name))
        .collect();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err(invalid("no matching components for wildcard"));
    }
    Ok(ids)
}

#[inline]
fn match_wildcard_inventory_id(id: String, scope: &str, name: &str) -> Option<String> {
    let (found_scope, found_name) = id.trim().split_once('/')?;
    let found_scope = found_scope.trim();
    let found_name = found_name
        .split_once('@')
        .map_or(found_name, |(base, _)| base)
        .trim();
    if found_scope != scope || !wildcard(name, found_name) {
        return None;
    }
    if id.len() == found_scope.len() + 1 + found_name.len() {
        Some(id)
    } else {
        Some(format!("{found_scope}/{found_name}"))
    }
}

#[inline]
fn literal(pattern: &str) -> io::Result<Vec<String>> {
    let pattern = pattern.trim();
    let (scope, name) =
        pattern.split_once('/').ok_or_else(|| invalid("component must have a scope"))?;
    let (scope, name) = (scope.trim(), name.trim());
    if scope.is_empty()
        || name.is_empty()
        || name.starts_with('/')
        || name.ends_with('/')
        || scope.contains("..")
        || name.contains("..")
    {
        return Err(invalid("remote component id"));
    }
    Ok(vec![format!("{scope}/{name}")])
}

fn inventory(
    context: &Context,
    runtime: &tokio::runtime::Runtime,
    remote: Remote,
    name: &str,
) -> io::Result<Vec<String>> {
    match remote {
        Remote::File(path) => {
            let index: Value = bit_object_import::parse_jsonc(&fs::read(path.join("index.json"))?)?;
            Ok(index["components"]
                .as_array()
                .or_else(|| index.as_array())
                .ok_or_else(|| invalid("remote component index"))?
                .iter()
                .filter_map(|row| {
                    let (scope, name) =
                        crate::commands::version_history::build::row_scope_and_name(row)?;
                    Some(format!("{scope}/{name}"))
                })
                .collect())
        }
        Remote::Http(url) => Ok(runtime
            .block_on(context.network.list(&url, Some(name)))?
            .into_iter()
            .map(|row| row.id())
            .collect()),
    }
}

#[inline]
fn wildcard(pattern: &str, text: &str) -> bool {
    let (mut pattern_index, mut text_index, mut star, mut retry) = (0, 0, None, 0);
    let pattern = pattern.as_bytes();
    let text = text.as_bytes();
    while text_index < text.len() {
        if pattern.get(pattern_index) == text.get(text_index) {
            pattern_index += 1;
            text_index += 1;
        } else if pattern.get(pattern_index) == Some(&b'*') {
            star = Some(pattern_index);
            pattern_index += 1;
            retry = text_index;
        } else if let Some(position) = star {
            pattern_index = position + 1;
            retry += 1;
            text_index = retry;
        } else {
            return false;
        }
    }
    pattern[pattern_index..]
        .iter()
        .all(|byte| *byte == b'*')
}

#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
