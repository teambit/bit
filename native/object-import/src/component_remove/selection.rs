//! Workspace.idsByPattern resolves exact names before matching full scoped pattern IDs.
use super::invalid;
use std::{fs, io, path::Path};
pub fn select_ids(root: &Path, pattern: &str) -> io::Result<Vec<String>> {
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
fn matching(bitmap: &serde_json::Value, parts: &[&str]) -> io::Result<Vec<String>> {
    let mut result = Vec::new();
    for (key, row) in bitmap.as_object().ok_or_else(|| invalid("component bitmap"))? {
        if row["isAvailableOnCurrentLane"] == false
            || row["isAvailableOnCurrentLane"]
                .as_str()
                .is_some_and(|val| val.trim().eq_ignore_ascii_case("false"))
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
fn matches(id: &str, parts: &[&str]) -> bool {
    let id = strip_version(id);
    let matched = |pattern: &str| bit_workspace_config::glob::matches(strip_version(pattern), id);
    parts
        .iter()
        .filter(|part| !part.trim().starts_with('!'))
        .any(|part| matched(part))
        && !parts
            .iter()
            .filter_map(|part| {
                part.trim()
                    .strip_prefix('!')
                    .map(str::trim)
            })
            .any(matched)
}
fn strip_version(value: &str) -> &str {
    let trimmed = value.trim();
    match trimmed.rsplit_once('@') {
        Some((base, _)) if !base.is_empty() => base,
        _ => trimmed,
    }
}
