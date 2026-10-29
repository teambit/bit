//! Validate indexed lanes before omitting unrelated heads.
use super::{Value, read};
use std::path::{Path, PathBuf};

pub(super) fn unrelated_lanes(
    root: &Path,
    scope: &str,
    name: &str,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<bool> {
    let index: Value = serde_json::from_slice(&proofs[1].1).ok()?;
    let lanes = index["lanes"].as_array()?;
    if lanes.len() > 128 {
        return None;
    }
    for entry in lanes {
        let lane = read(root, entry["hash"].as_str()?, "Lane", proofs)?;
        if !lane_is_unrelated(&lane, scope, name)? {
            return Some(false);
        }
    }
    Some(true)
}

pub(super) fn lane_is_unrelated(lane: &Value, scope: &str, name: &str) -> Option<bool> {
    identifier(lane["name"].as_str()?)?;
    identifier(lane["scope"].as_str()?)?;
    if !lane["readmeComponent"].is_null() || !lane["forkedFrom"].is_null() {
        return None;
    }
    for component in lane["components"].as_array()? {
        let id = &component["id"];
        let head = component["head"].as_str()?;
        if head.len() != 40 || !head.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        let component_scope = identifier(id["scope"].as_str()?)?;
        let component_name = identifier(id["name"].as_str()?)?;
        if component_scope == scope && component_name == name {
            return Some(false);
        }
    }
    hidden_unrelated(&lane["updateDependents"], scope, name)
}

fn hidden_unrelated(hidden: &Value, scope: &str, name: &str) -> Option<bool> {
    if hidden.is_null() {
        return Some(true);
    }
    for id in hidden.as_array()? {
        let (id, hash) = id.as_str()?.split_once('@')?;
        identifier(id)?;
        if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        if id == format!("{scope}/{name}") {
            return Some(false);
        }
    }
    Some(true)
}

fn identifier(value: &str) -> Option<&str> {
    (!value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"/._-".contains(&byte)))
    .then_some(value)
}
