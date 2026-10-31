//! Validate indexed lanes before omitting unrelated heads.
use super::{Value, read};
use std::path::{Path, PathBuf};

pub(super) fn lane_heads(
    root: &Path,
    scope: &str,
    name: &str,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<Vec<String>> {
    let index: Value = bit_object_import::parse_jsonc(&proofs[1].1).ok()?;
    if index.is_array() {
        return Some(Vec::new());
    }
    let lanes = index["lanes"].as_array()?;
    if lanes.len() > 128 {
        return None;
    }
    let mut heads = Vec::new();
    for entry in lanes {
        let lane = read(root, entry["hash"].as_str()?, "Lane", proofs)?;
        if let Some(head) = lane_head(&lane, scope, name)? {
            heads.push(head);
        }
    }
    Some(heads)
}

pub(super) fn lane_head(lane: &Value, scope: &str, name: &str) -> Option<Option<String>> {
    identifier(lane["name"].as_str()?)?;
    identifier(lane["scope"].as_str()?)?;
    if !lane["readmeComponent"].is_null() || !lane["forkedFrom"].is_null() {
        return None;
    }
    let mut visible = None;
    for component in lane["components"].as_array()? {
        let head = component["head"].as_str()?.trim();
        if head.len() != 40 || !head.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        let (component_scope, component_name) = lane_component_id(&component["id"])?;
        if component_scope == scope
            && component_name == name
            && visible.replace(head.to_owned()).is_some()
        {
            return None;
        }
    }
    let hidden = hidden_head(&lane["updateDependents"], scope, name)?;
    Some(visible.or(hidden))
}

fn lane_component_id(id: &Value) -> Option<(&str, &str)> {
    let (raw_scope, raw_name) = if let Some(raw) = id.as_str() {
        raw.rsplit_once('@')
            .map_or(raw, |(bare, _)| bare)
            .split_once('/')?
    } else {
        (id["scope"].as_str()?, id["name"].as_str()?)
    };
    Some((identifier(raw_scope)?, identifier(raw_name)?))
}

fn hidden_head(hidden: &Value, scope: &str, name: &str) -> Option<Option<String>> {
    if hidden.is_null() {
        return Some(None);
    }
    let mut head = None;
    for id in hidden.as_array()? {
        let (id, hash) = id.as_str()?.split_once('@')?;
        identifier(id)?;
        if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        if id == format!("{scope}/{name}") && head.replace(hash.to_owned()).is_some() {
            return None;
        }
    }
    Some(head)
}

fn identifier(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"/._-".contains(&byte)))
    .then_some(value)
}
