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
    let (name, version) = selector
        .rsplit_once('@')
        .map_or((selector, None), |(name, version)| (name, Some(version)));
    if version.is_some_and(|version| row["version"].as_str() != Some(version)) {
        return false;
    }
    let Some(identity) = row["identity"].as_str() else {
        return false;
    };
    let component_name = identity.split_once('/').map_or(identity, |(_, name)| name);
    let directory = name
        .strip_prefix("./")
        .unwrap_or(name)
        .trim_end_matches('/');
    identity == name || component_name == name || row["directory"].as_str() == Some(directory)
}
