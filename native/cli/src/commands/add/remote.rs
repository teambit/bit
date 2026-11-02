//! Best-effort remote [`Host`] collision facts after the tracked [`Projection`] `.bitmap` is persisted.
//!
//! Emits [`warn`] diagnostics when newly tracked components collide with remote scope IDs.
use super::projection::Projection;
use crate::{
    commands::{color::Chalk, workspace_command::format::Formatter},
    host::Host,
};
use serde_json::{Value, json};
/// Emits best-effort remote component collision warnings via `host` after `.bitmap` publication.
pub(super) fn warn(
    host: &Host,
    added: &[Value],
    projection: &Projection,
    chalk: Chalk,
    output: &bit_install::output::Output,
) {
    let ids = candidates(added, projection);
    if ids.is_empty() {
        return;
    }
    let Ok(ids) = host.call("trackingRemoteExistence", &json!({"ids":ids})) else {
        return;
    };
    let Some(ids) = ids
        .as_array()
        .filter(|ids| !ids.is_empty())
    else {
        return;
    };
    let rendered = ids
        .iter()
        .filter_map(remote_id_str)
        .collect::<Vec<_>>();
    let Some(example) = rendered.first() else {
        return;
    };
    let name = example.split_once('/').map_or(example.as_str(), |(_, name)| name);
    let formatter = Formatter::new(chalk);
    let rows = rendered
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>()
        .join("\n");
    let text = format!(
        "the following newly added component(s) already exist on the remote scope with the same id:\n{rows}\nif you meant to work on the existing component, remove your local one and run \"bit import {example}\".\nif this is a new, unrelated component, rename yours to avoid the clash, e.g. \"bit rename {name} <new-name>\" (or \"bit rename {name} {name} --scope <other-scope>\" to change only the scope).",
    );
    output.warning(&text);
}

/// Formats a remote component identifier from `value` as `<scope>/<name>` or `<name>`.
#[inline]
fn remote_id_str(value: &Value) -> Option<String> {
    if let Some(id) = non_empty_str(value)
        .or_else(|| non_empty_str(&value["id"]))
        .or_else(|| non_empty_str(&value["identity"]))
    {
        return Some(id.to_owned());
    }
    let name = non_empty_str(&value["name"]).or_else(|| non_empty_str(&value["id"]["name"]))?;
    Some(
        non_empty_str(&value["scope"])
            .or_else(|| non_empty_str(&value["id"]["scope"]))
            .filter(|scope| !scope.contains('/'))
            .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}")),
    )
}

/// Returns `Some` trimmed string when `value` is a non-empty JSON string.
#[inline]
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// Collects unique unscoped component rows from `added` that belong to `projection`.
fn candidates(added: &[Value], projection: &Projection) -> Vec<Value> {
    let unscoped: std::collections::HashSet<String> = projection.workspace
        .components
        .iter()
        .filter(|component| component.id.scope.is_none())
        .map(|component| {
            component.id
                .to_string_without_version()
                .trim()
                .to_owned()
        })
        .collect();
    let mut seen = std::collections::HashSet::new();
    added
        .iter()
        .filter_map(|row| {
            let identity = row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .map(str::trim)
                .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
                .filter(|id| !id.is_empty())?;
            (unscoped.contains(identity) && seen.insert(identity)).then(|| {
                Value::String(identity.to_owned())
            })
        })
        .collect()
}
