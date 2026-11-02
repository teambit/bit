//! Filter the published switch [`Entry`] pool via [`chosen`] before native materialization.

#[cfg(test)]
mod tests;

use super::{Prepare, invalid, validation::canonical};
use crate::command_import::lane::Entry;
use serde_json::Value;
use std::io;

/// Filters `lane` ([`Entry`]) entries by `--pattern` ([`filter`]) and `--workspace-only` options on `request` ([`Prepare`]).
pub(super) fn chosen(
    request: &Prepare,
    bitmap: &Value,
    lane: &[Entry],
) -> io::Result<Option<Vec<String>>> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("switch lane missing"))?;
    let pattern = options.pattern
        .as_deref()
        .map(str::trim)
        .filter(|pattern| !pattern.is_empty());
    let rows = bitmap.as_object().ok_or_else(|| invalid("switch bitmap"))?;
    if pattern.is_some() && has_tracked(rows) {
        return Err(canonical("error: use --pattern only when the workspace is empty".into()));
    }
    let matched = pattern.map(|pattern| filter(pattern, lane)).transpose()?;
    if !options.workspace_only {
        return Ok(matched);
    }
    let settings = super::config::configuration_for_command(&request.root, true)?;
    let visible = super::super::lane_context::visibility::targets(bitmap, &settings)?;
    let mut allowed = visible
        .iter()
        .filter_map(|row| row["identity"].as_str().map(str::trim))
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if let Some(matched) = matched {
        allowed.retain(|id| {
            matched
                .iter()
                .any(|item| item.trim() == id.trim())
        });
    }
    Ok(Some(allowed))
}

/// Returns `true` when `rows` contains any tracked component entry outside `.bitmap` metadata keys.
#[inline]
fn has_tracked(rows: &serde_json::Map<String, Value>) -> bool {
    rows.keys()
        .map(String::as_str)
        .map(str::trim)
        .any(|trimmed| !trimmed.starts_with('$') && !matches!(trimmed, "_bit_lane" | "version"))
}

/// Matches `entries` against comma-separated glob `pattern` tokens, supporting `!` exclusions.
fn filter(pattern: &str, entries: &[Entry]) -> io::Result<Vec<String>> {
    let mut patterns = pattern
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>();
    if pattern.len() > 4096 || patterns.len() > 128 || pattern.contains(['$', '&']) {
        return Err(invalid("switch unsupported component pattern"));
    }
    if patterns
        .iter()
        .all(|pattern| pattern.starts_with('!'))
    {
        patterns.insert(0, "**");
    }
    let mut selected = Vec::new();
    for pattern in patterns {
        let pattern = pattern
            .split('@')
            .next()
            .map_or("", str::trim);
        let (exclude, pattern) = pattern
            .strip_prefix('!')
            .map_or((false, pattern), |rest| (true, rest.trim()));
        let pattern = pattern.trim_start_matches('/').trim();
        if !pattern.is_empty() {
            update_selection(&mut selected, entries, pattern, exclude);
        }
    }
    if selected.is_empty() {
        return Err(canonical(format!(
            r#"unable to find any component matching the "{pattern}" pattern"#,
        )));
    }
    Ok(selected)
}

/// Adds or removes `entries` matching `pattern` in `selected` depending on `exclude`.
#[inline]
fn update_selection(selected: &mut Vec<String>, entries: &[Entry], pattern: &str, exclude: bool) {
    for entry in entries
        .iter()
        .filter(|entry| bit_workspace_config::glob::matches(pattern, entry.identity.trim()))
    {
        let entry_id = entry.identity.trim();
        if exclude {
            selected.retain(|id| id != entry_id);
        } else if !selected.iter().any(|id| id == entry_id) {
            selected.push(entry_id.to_owned());
        }
    }
}

#[inline]
pub(super) fn ordered(mut entries: Vec<Entry>, selected: Option<&[String]>) -> Vec<Entry> {
    if let Some(selected) = selected {
        entries.sort_by_key(|entry| {
            let entry_id = entry.identity.trim();
            selected
                .iter()
                .position(|id| id.trim() == entry_id)
        });
    }
    entries
}
#[inline]
pub(super) fn attach(context: &mut Value, request: &Prepare) -> io::Result<()> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("switch lane missing"))?;
    let selected = context["targets"]
        .as_array()
        .ok_or_else(|| invalid("switch selected targets"))?
        .iter()
        .chain(
            context["lane"]["addedTargets"]
                .as_array()
                .into_iter()
                .flatten(),
        )
        .filter_map(|row| row["identity"].as_str().map(str::trim))
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    context["lane"]["switchSelectedIds"] = serde_json::json!(selected);
    context["lane"]["switchWorkspaceOnly"] = serde_json::json!(options.workspace_only);
    Ok(())
}
