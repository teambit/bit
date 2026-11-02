//! `Workspace.idsByPattern` resolution ([`select_ids`]) of exact names before matching full scoped pattern IDs.
use super::invalid;
use std::{fs, io, path::Path};
/// Resolves a component ID or glob `pattern` against `.bitmap` in `Workspace.idsByPattern` order.
pub fn select_ids(root: &Path, pattern: &str) -> io::Result<Vec<String>> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return Err(invalid("component selection pattern is empty"));
    }
    if pattern == "$deprecated" {
        return crate::component_deprecation::Plan::prepare(root, pattern, None, None, true)
            .map(|plan| plan.changed().to_vec());
    }
    if pattern.contains('$') || pattern.contains(" AND ") {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "component state selection requires native status facts",
        ));
    }
    let bitmap = crate::parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    if !pattern.contains(['*', ',', '!', ':']) {
        return crate::component_deprecation::selection::resolve(&bitmap, pattern)
            .map(|id| vec![id]);
    }
    let mut parts = pattern
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts
        .iter()
        .all(|part| part.starts_with('!'))
    {
        parts.insert(0, "**");
    }
    let result = matching(&bitmap, &parts)?;
    if result.is_empty() {
        return Err(invalid(&format!(
            r#"unable to find any component matching the "{pattern}" pattern"#,
        )));
    }
    Ok(result)
}
/// Filter active `.bitmap` entries to component IDs matching the positive/negative glob `parts`.
fn matching(bitmap: &serde_json::Value, parts: &[&str]) -> io::Result<Vec<String>> {
    let mut result = Vec::new();
    for (key, row) in bitmap.as_object().ok_or_else(|| invalid("component bitmap"))? {
        if row["isAvailableOnCurrentLane"] == false
            || row["isAvailableOnCurrentLane"]
                .as_str()
                .is_some_and(|val| val.trim().eq_ignore_ascii_case("false"))
            || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        {
            continue;
        }
        if let Some(id) = crate::component_deprecation::selection::identity(key, row)
            && matches(&id, parts)
        {
            result.push(id);
        }
    }
    Ok(result)
}
/// Return `true` when component `id` matches the positive and negative glob `parts`.
#[inline]
fn matches(id: &str, parts: &[&str]) -> bool {
    let id = strip_version(id);
    let short_name = id.split_once('/').map(|(_, name)| name);
    let matched = |pattern: &str| {
        let pat = strip_version(pattern);
        bit_workspace_config::glob::matches(pat, id)
            || short_name.is_some_and(|name| bit_workspace_config::glob::matches(pat, name))
    };
    parts
        .iter()
        .filter(|part| !part.starts_with('!'))
        .any(|part| matched(part))
        && !parts
            .iter()
            .filter_map(|part| part.strip_prefix('!'))
            .any(matched)
}
/// Strip any non-empty `@version` suffix from `value` after trimming whitespace.
#[inline]
fn strip_version(value: &str) -> &str {
    let trimmed = value.trim();
    match trimmed.rsplit_once('@') {
        Some((base, _)) if !base.trim().is_empty() => base.trim(),
        _ => trimmed,
    }
}
