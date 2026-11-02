//! Prove an existing history is complete before owning its no-change rebuild.
//!
//! Coordinates [`bare`] scope rebuilds, [`has_bool_flag`], [`startup`] checks, and [`Formatter`] output into [`Outcome`].
mod bare;
#[cfg(test)]
mod tests;

use super::{
    Chalk, Outcome, ScopeRoot, Value, emit_text, resolve_component_entry, scope_dir_for, sha1_hex,
};
use crate::commands::{remote_action::startup, workspace_command::format::Formatter};
use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs, io,
};

/// Evaluates the last occurrence of boolean CLI flag `bare` / `truthy` / `falsy` before `--` in `args`.
#[must_use]
#[inline]
pub(super) fn has_bool_flag(args: &[OsString], bare: &str, truthy: &str, falsy: &str) -> bool {
    args.iter()
        .take_while(|arg| arg.to_str().map(str::trim) != Some("--"))
        .fold(false, |acc, arg| {
            let trimmed = arg.to_str().map(str::trim);
            if trimmed == Some(bare) || trimmed == Some(truthy) {
                true
            } else if trimmed == Some(falsy) {
                false
            } else {
                acc
            }
        })
}

pub(super) fn run(
    root: &ScopeRoot,
    args: &[OsString],
    id: &str,
    from: Option<&str>,
) -> io::Result<Outcome> {
    let delete_existing = has_bool_flag(
        args,
        "--delete-existing",
        "--delete-existing=true",
        "--delete-existing=false",
    );
    let from_all_lanes =
        has_bool_flag(args, "--from-all-lanes", "--from-all-lanes=true", "--from-all-lanes=false");
    if root.bare
        && let Some(plan) = bare::prepare(root, id, from, from_all_lanes, delete_existing)
    {
        return plan.run(root, args);
    }
    if delete_existing {
        return Ok(Outcome::Declined(
            "version-history deletion requires a supported scope layout".into(),
        ));
    }
    let Some(identities) = select(root, id, from) else {
        return Ok(Outcome::Declined(
            "version-history rebuild requires a complete local graph".into(),
        ));
    };
    let chalk = Chalk::detect(args);
    let summary = Formatter::new(chalk).success_summary("completed building version history");
    let lines = identities
        .iter()
        .map(|id| format!("{}: no changes", chalk.bold(id)))
        .collect::<Vec<_>>()
        .join("\n");
    let report = format!("{summary}\n{lines}");
    emit_text(root, args, "build", true, report)
}

#[inline]
fn select(root: &ScopeRoot, id: &str, from: Option<&str>) -> Option<Vec<String>> {
    if id.contains('*') || id.contains(',') {
        return by_pattern(root, id, from);
    }
    Some(vec![prepare(root, id, from)?])
}

fn by_pattern(root: &ScopeRoot, pattern: &str, from: Option<&str>) -> Option<Vec<String>> {
    if pattern
        .split(',')
        .map(str::trim)
        .any(|part| part.starts_with('$') || part.contains(" AND "))
    {
        return None;
    }
    let scope = scope_dir_for(root);
    let candidates = index_candidates(&scope)?;
    let refs = candidates
        .iter()
        .map(|(id, _)| id.as_str())
        .collect::<Vec<_>>();
    let matched: HashSet<String> =
        crate::commands::patterns::matching(&refs, &crate::commands::patterns::split(pattern))
            .ok()?
            .into_iter()
            .map(str::to_owned)
            .collect();
    if matched.is_empty() || (matched.len() > 1 && from.is_some()) {
        return None;
    }
    let mut identities = Vec::with_capacity(matched.len());
    for (identity, versioned) in candidates {
        if matched.contains(&identity) {
            prepare(root, &identity, from)?;
            identities.push(versioned);
        }
    }
    Some(identities)
}

fn index_candidates(scope: &std::path::Path) -> Option<Vec<(String, String)>> {
    let index: Value =
        bit_object_import::parse_jsonc(&fs::read(scope.join("index.json")).ok()?).ok()?;
    let rows = index["components"].as_array().or_else(|| index.as_array())?;
    if rows.len() > 128 {
        return None;
    }
    let mut candidates = Vec::with_capacity(rows.len());
    for row in rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
    {
        if let Some(candidate) = candidate_row(scope, row)? {
            candidates.push(candidate);
        }
    }
    Some(candidates)
}

fn candidate_row(scope: &std::path::Path, row: &Value) -> Option<Option<(String, String)>> {
    let hash = row["hash"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())?;
    let (kind, model) = bit_object_import::read_scope_object(scope, hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let Some(head) = model["head"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
    else {
        return Some(None);
    };
    let (row_scope, row_name) = row_scope_and_name(row)?;
    let identity = format!("{row_scope}/{row_name}");
    let version = super::text::tags(&model, head).unwrap_or(head);
    Some(Some((identity.clone(), format!("{identity}@{version}"))))
}

#[must_use]
#[inline]
pub(in crate::commands) fn row_scope_and_name(row: &Value) -> Option<(&str, &str)> {
    if let Some(raw) = row["id"].as_str() {
        let bare = bit_install::config::aspect_id_without_version(raw.trim()).trim();
        let (scope, name) = bare.split_once('/')?;
        let (scope, name) = (scope.trim(), name.trim());
        return (!scope.is_empty() && !name.is_empty()).then_some((scope, name));
    }
    Some((
        row["id"]["scope"]
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())?,
        row["id"]["name"]
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())?,
    ))
}

fn prepare(root: &ScopeRoot, id: &str, from: Option<&str>) -> Option<String> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"/._-".contains(&byte))
    {
        return None;
    }
    let scope_dir = scope_dir_for(root);
    if !supported_startup(root, &scope_dir)? {
        return None;
    }
    let (scope, name, model_hash) = resolve_component_entry(&scope_dir, id)?;
    let scope = scope?;
    let (kind, model) = bit_object_import::read_scope_object(&scope_dir, &model_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let head = from
        .or_else(|| model["head"].as_str())?
        .trim();
    if head.len() != 40 || !head.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let (kind, history) = bit_object_import::read_scope_object(&scope_dir, &hash).ok()??;
    if kind != "VersionHistory" || !complete(&history, head)? {
        return None;
    }
    Some(format!("{scope}/{name}"))
}

#[must_use]
#[inline]
pub(super) fn supported_startup(root: &ScopeRoot, scope: &std::path::Path) -> Option<bool> {
    let workspace = (!root.bare).then_some(root.path.as_path());
    let config = match workspace {
        Some(path) => {
            bit_workspace_config::parse_jsonc(&fs::read(path.join("workspace.jsonc")).ok()?).ok()?
        }
        None => Value::Null,
    };
    startup::supported(workspace, scope, &config, true).ok()
}

fn complete(history: &Value, head: &str) -> Option<bool> {
    let head = head.trim();
    let rows = history["versions"].as_array()?;
    if rows.len() > 10000 {
        return None;
    }
    let by_hash = parent_index(rows)?;
    if history["graphCompleteRefs"]
        .as_array()
        .is_some_and(|refs| {
            refs.iter()
                .any(|value| value.as_str().map(str::trim) == Some(head))
        })
    {
        return Some(true);
    }
    let mut visited = HashSet::with_capacity(by_hash.len());
    let mut pending = vec![head];
    while let Some(hash) = pending.pop() {
        if !visited.insert(hash) {
            continue;
        }
        let Some(parents) = by_hash.get(hash) else { return Some(false) };
        for parent in *parents {
            pending.push(parent.as_str()?.trim());
        }
    }
    Some(true)
}

#[inline]
fn parent_index(rows: &[Value]) -> Option<HashMap<&str, &Vec<Value>>> {
    let mut by_hash = HashMap::with_capacity(rows.len());
    for row in rows {
        let hash = row["hash"].as_str()?.trim();
        if hash.is_empty()
            || by_hash
                .insert(hash, row["parents"].as_array()?)
                .is_some()
        {
            return None;
        }
    }
    Some(by_hash)
}
