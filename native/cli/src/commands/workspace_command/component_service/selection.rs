use super::{Value, invalid};
use std::io;

pub(super) fn exact(targets: &[Value], selectors: &[String]) -> io::Result<Vec<Value>> {
    if selectors.is_empty() {
        return Ok(targets.to_vec());
    }
    let mut selected = Vec::new();
    for selector in selectors {
        let row = targets
            .iter()
            .find(|row| matches(row, selector))
            .ok_or_else(|| invalid("compiler component selector"))?;
        if !selected.contains(row) {
            selected.push(row.clone());
        }
    }
    Ok(selected)
}
fn matches(row: &Value, selector: &str) -> bool {
    let selector = selector.trim();
    let (name, version) = selector
        .rsplit_once('@')
        .map_or((selector, None), |(name, version)| (name.trim(), Some(version.trim())));
    let row_version = row["version"]
        .as_str()
        .or_else(|| row["head"].as_str())
        .map(str::trim);
    if version.is_some_and(|version| row_version != Some(version)) {
        return false;
    }
    let Some(raw_identity) = row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
    else {
        return false;
    };
    let raw_identity = raw_identity.trim();
    let identity = raw_identity.rsplit_once('@').map_or(raw_identity, |(base, _)| base.trim());
    let component_name = identity.split_once('/').map_or(identity, |(_, name)| name.trim());
    let normalized = name.replace('\\', "/");
    let directory = normalized
        .strip_prefix("./")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    let row_dir = row["directory"]
        .as_str()
        .map(|dir| dir.trim().trim_end_matches('/'));
    identity == name || component_name == name || row_dir == Some(directory)
}
