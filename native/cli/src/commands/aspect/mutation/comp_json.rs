use super::{CompJsonEdit, deep_merge, find_bitmap_row_mut, find_matching_aspect_key};
use crate::commands::scope_set::Failure;
use bit_install::workspace::BitmapEntry;
use serde_json::{Value, json};
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
    exist_aspect_id: &str,
) -> Result<CompJsonEdit, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value =
        serde_json::from_str(&content).map_err(|err| Failure::Declined(err.to_string()))?;
    let Some(ext_obj) = parsed["extensions"].as_object_mut() else {
        return Err(Failure::Declined("component.json extensions missing".into()));
    };
    if let Some(found_key) = find_matching_aspect_key(ext_obj, bare_aspect) {
        ext_obj.remove(&found_key);
    } else {
        ext_obj.insert(exist_aspect_id.to_owned(), json!("-"));
    }
    let bytes = serialize_json_preserving_newline(&content, &parsed)?;
    Ok(CompJsonEdit { path, bytes })
}

pub(super) fn unset_in_bitmap_row(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    bare_aspect: &str,
    exist_aspect_id: &str,
) -> Result<(), Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    if remove_bitmap_config_key(row, bare_aspect)? {
        return Ok(());
    }
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg = row_obj
        .entry("config")
        .or_insert_with(|| json!({}));
    let cfg_obj =
        cfg.as_object_mut().ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    cfg_obj.insert(exist_aspect_id.to_owned(), json!("-"));
    Ok(())
}

fn remove_bitmap_config_key(row: &mut Value, bare_aspect: &str) -> Result<bool, Failure> {
    let Some(cfg_obj) = row.get_mut("config").and_then(Value::as_object_mut) else {
        return Ok(false);
    };
    let Some(found_key) = find_matching_aspect_key(cfg_obj, bare_aspect) else {
        return Ok(false);
    };
    if cfg_obj.get(&found_key).and_then(Value::as_str) == Some("-") {
        return Err(Failure::Declined("aspect already minus in bitmap".into()));
    }
    cfg_obj.remove(&found_key);
    if cfg_obj.is_empty()
        && let Some(row_obj) = row.as_object_mut()
    {
        row_obj.remove("config");
    }
    Ok(true)
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
