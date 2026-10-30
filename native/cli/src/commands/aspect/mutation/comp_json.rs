use super::{CompJsonEdit, deep_merge, find_matching_aspect_key};
use crate::commands::scope_set::Failure;
use serde_json::Value;
use std::{fs, path::PathBuf};

pub(super) fn set_in_comp_json(
    path: PathBuf,
    resolved_aspect_id: &str,
    bare_aspect: &str,
    config: &Value,
    merge: bool,
) -> Result<CompJsonEdit, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value =
        serde_json::from_str(&content).map_err(|err| Failure::Declined(err.to_string()))?;
    let Some(ext_obj) = parsed["extensions"].as_object_mut() else {
        return Err(Failure::Declined("component.json extensions missing".into()));
    };
    if let Some(found_key) = find_matching_aspect_key(ext_obj, bare_aspect) {
        let new_cfg = match (merge, ext_obj.get(&found_key)) {
            (true, Some(existing)) if existing.is_object() && config.is_object() => {
                let mut merged = existing.clone();
                deep_merge(&mut merged, config);
                merged
            }
            _ => config.clone(),
        };
        ext_obj.insert(found_key, new_cfg);
    } else {
        ext_obj.insert(resolved_aspect_id.to_owned(), config.clone());
    }
    let bytes = serialize_json_preserving_newline(&content, &parsed)?;
    Ok(CompJsonEdit { path, bytes })
}

pub(super) fn unset_in_comp_json(
    path: PathBuf,
    bare_aspect: &str,
) -> Result<CompJsonEdit, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value =
        serde_json::from_str(&content).map_err(|err| Failure::Declined(err.to_string()))?;
    let Some(ext_obj) = parsed["extensions"].as_object_mut() else {
        return Err(Failure::Declined("component.json extensions missing".into()));
    };
    let Some(found_key) = find_matching_aspect_key(ext_obj, bare_aspect) else {
        return Err(Failure::Declined("aspect not in component.json".into()));
    };
    if ext_obj.get(&found_key).and_then(Value::as_str) == Some("-") {
        return Err(Failure::Declined("aspect already minus in component.json".into()));
    }
    ext_obj.remove(&found_key);
    let bytes = serialize_json_preserving_newline(&content, &parsed)?;
    Ok(CompJsonEdit { path, bytes })
}

pub(in crate::commands) fn serialize_json_preserving_newline(
    original: &str,
    parsed: &Value,
) -> Result<Vec<u8>, Failure> {
    let newline = if original.contains("\r\n") { "\r\n" } else { "\n" };
    let rendered = format!(
        "{}{newline}",
        serde_json::to_string_pretty(parsed).map_err(|err| Failure::Declined(err.to_string()))?,
    );
    Ok(if newline == "\r\n" {
        rendered.replace('\n', "\r\n").into_bytes()
    } else {
        rendered.into_bytes()
    })
}
