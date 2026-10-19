//! Filter the published switch pool after fetching and before native materialization.
use super::{Prepare, invalid, validation::canonical};
use crate::command_import::lane::Entry;
use serde_json::Value;
use std::io;

pub(super) fn chosen(
    request: &Prepare,
    bitmap: &Value,
    lane: &[Entry],
) -> io::Result<Option<Vec<String>>> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("switch lane missing"))?;
    let pattern = options.pattern
        .as_deref()
        .filter(|pattern| !pattern.is_empty());
    let rows = bitmap.as_object().ok_or_else(|| invalid("switch bitmap"))?;
    let tracked = rows
        .iter()
        .filter(|(key, _)| !matches!(key.as_str(), "$schema-version" | "_bit_lane"));
    if pattern.is_some() && tracked.clone().next().is_some() {
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
        .filter_map(|row| row["identity"].as_str())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if let Some(matched) = matched {
        allowed.retain(|id| matched.contains(id));
    }
    Ok(Some(allowed))
}

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
            .unwrap_or_default();
        let (exclude, pattern) = pattern
            .strip_prefix('!')
            .map_or((false, pattern), |pattern| (true, pattern));
        update_selection(&mut selected, entries, pattern, exclude);
    }
    if selected.is_empty() {
        return Err(canonical(format!(
            r#"unable to find any component matching the "{pattern}" pattern"#,
        )));
    }
    Ok(selected)
}

fn update_selection(selected: &mut Vec<String>, entries: &[Entry], pattern: &str, exclude: bool) {
    for entry in
        entries.iter().filter(|entry| bit_workspace_config::glob::matches(pattern, &entry.identity))
    {
        if exclude {
            selected.retain(|id| id != &entry.identity);
        } else if !selected.contains(&entry.identity) {
            selected.push(entry.identity.clone());
        }
    }
}

pub(super) fn ordered(mut entries: Vec<Entry>, selected: Option<&[String]>) -> Vec<Entry> {
    if let Some(selected) = selected {
        entries.sort_by_key(|entry| {
            selected
                .iter()
                .position(|id| id == &entry.identity)
        });
    }
    entries
}
pub(super) fn attach(context: &mut Value, request: &Prepare) -> io::Result<()> {
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
        .filter_map(|row| row["identity"].as_str())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    context["lane"]["switchSelectedIds"] = serde_json::json!(selected);
    context["lane"]["switchWorkspaceOnly"] =
        serde_json::json!(request.options.lane.as_ref().unwrap().workspace_only);
    Ok(())
}

#[cfg(test)]
mod tests;
