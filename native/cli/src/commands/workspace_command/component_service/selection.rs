//! Component selector resolution for built-in environment services.
//!
//! [`exact`] and [`matches`] resolve selector strings against workspace component [`Value`] entries.
use super::{Value, invalid};
use std::io;

/// Resolves `selectors` in order against `targets`, returning the deduplicated matching component [`Value`] rows.
pub(super) fn exact(targets: &[Value], selectors: &[String]) -> io::Result<Vec<Value>> {
    if selectors.is_empty() {
        return Ok(targets.to_vec());
    }
    let mut selected = Vec::with_capacity(selectors.len());
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

/// Returns `true` when component `row` matches `selector` by ID, bare name, or directory path.
#[inline]
fn matches(row: &Value, selector: &str) -> bool {
    let selector = selector.trim();
    let (name, version) = selector
        .rsplit_once('@')
        .map_or((selector, None), |(name, version)| (name.trim(), Some(version.trim())));
    if version.is_some_and(|ver| row_text(row, ["version", "head"]) != Some(ver)) {
        return false;
    }
    let Some(raw_identity) = row_text(row, ["identity", "id"]) else {
        return false;
    };
    let identity = bit_install::config::aspect_id_without_version(raw_identity).trim();
    let component_name = identity.split_once('/').map_or(identity, |(_, name)| name.trim());
    if identity == name || component_name == name {
        return true;
    }
    let directory = normalized_dir(name);
    !directory.is_empty()
        && row_text(row, ["directory", "rootDir"])
            .is_some_and(|dir| normalized_dir(dir) == directory)
}

/// Returns the first non-empty trimmed string value found in `row` for `keys`.
#[inline]
fn row_text<'r>(row: &'r Value, keys: [&str; 2]) -> Option<&'r str> {
    keys.into_iter()
        .filter_map(|key| row[key].as_str())
        .map(str::trim)
        .find(|val| !val.is_empty())
}

#[inline]
fn normalized_dir(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    normalized
        .trim_start_matches("./")
        .trim_end_matches('/')
        .to_owned()
}
