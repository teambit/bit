//! Updating aspect entries in `.bitmap` ([`update_in_bitmap_row`]) and `component.json` ([`update_in_comp_json`]).
//!
//! Exposes [`set_in_comp_json`], [`unset_in_comp_json`], and [`serialize_json_preserving_newline`].

use super::{CompJsonEdit, deep_merge, find_bitmap_row_mut, find_matching_aspect_key};
use crate::commands::scope_set::Failure;
use bit_install::workspace::BitmapEntry;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

/// Sets or deep-merges `config` via [`deep_merge`] for `bare_aspect` in a `component.json` file at `path`.
pub(super) fn set_in_comp_json(
    path: PathBuf,
    resolved_aspect_id: &str,
    bare_aspect: &str,
    config: &Value,
    merge: bool,
) -> Result<CompJsonEdit, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value = bit_object_import::parse_jsonc(content.as_bytes())?;
    let ext_obj = comp_json_extensions_mut(&mut parsed)?;
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

/// Applies an aspect `set` or `--merge` update to a `.bitmap` component `entry`.
pub(super) fn apply_set_to_entry(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    resolved_aspect_id: &str,
    bare_aspect: &str,
    config: &Value,
    merge: bool,
) -> Result<bool, Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let cfg_obj = bitmap_row_config_mut(row)?;
    let target_key = find_matching_aspect_key(cfg_obj, bare_aspect)
        .unwrap_or_else(|| resolved_aspect_id.to_owned());
    let current = cfg_obj.get(&target_key);
    if current == Some(config) {
        return Ok(false);
    }
    let new_cfg = match (merge, current) {
        (true, Some(existing)) if existing.is_object() && config.is_object() => {
            let mut merged = existing.clone();
            deep_merge(&mut merged, config);
            merged
        }
        _ => config.clone(),
    };
    cfg_obj.insert(target_key, new_cfg);
    Ok(true)
}

/// Unsets `bare_aspect` in `component.json` at `path`, inserting `"-"` when inherited from an outer layer.
pub(super) fn unset_in_comp_json(
    path: PathBuf,
    bare_aspect: &str,
    exist_aspect_id: &str,
) -> Result<CompJsonEdit, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value = bit_object_import::parse_jsonc(content.as_bytes())?;
    let ext_obj = comp_json_extensions_mut(&mut parsed)?;
    if let Some(found_key) = find_matching_aspect_key(ext_obj, bare_aspect) {
        if ext_obj
            .get(&found_key)
            .and_then(Value::as_str)
            .map(str::trim)
            == Some("-")
        {
            return Err(Failure::Declined("aspect already minus in component.json".into()));
        }
        ext_obj.remove(&found_key);
    } else {
        ext_obj.insert(exist_aspect_id.to_owned(), json!("-"));
    }
    let bytes = serialize_json_preserving_newline(&content, &parsed)?;
    Ok(CompJsonEdit { path, bytes })
}

/// Replaces any matching `bare_aspect` key in `component.json` at `path` with `target_aspect_id` and `cfg_val`.
pub(in crate::commands) fn update_in_comp_json(
    path: PathBuf,
    bare_aspect: &str,
    target_aspect_id: &str,
    cfg_val: &Value,
) -> Result<CompJsonEdit, Failure> {
    validate_aspect_target(target_aspect_id)?;
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value = bit_object_import::parse_jsonc(content.as_bytes())?;
    let ext_obj = comp_json_extensions_mut(&mut parsed)?;
    if let Some(old_key) = find_matching_aspect_key(ext_obj, bare_aspect) {
        ext_obj.remove(&old_key);
    }
    ext_obj.insert(target_aspect_id.to_owned(), cfg_val.clone());
    let bytes = serialize_json_preserving_newline(&content, &parsed)?;
    Ok(CompJsonEdit { path, bytes })
}

/// Replaces any matching `bare_aspect` key in `entry`'s `.bitmap` `config` object with `target_aspect_id` and `cfg_val`.
pub(in crate::commands) fn update_in_bitmap_row(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    bare_aspect: &str,
    target_aspect_id: &str,
    cfg_val: &Value,
) -> Result<(), Failure> {
    validate_aspect_target(target_aspect_id)?;
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let cfg_obj = bitmap_row_config_mut(row)?;
    if let Some(old_key) = find_matching_aspect_key(cfg_obj, bare_aspect) {
        cfg_obj.remove(&old_key);
    }
    cfg_obj.insert(target_aspect_id.to_owned(), cfg_val.clone());
    Ok(())
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
    let cfg_obj = bitmap_row_config_mut(row)?;
    cfg_obj.insert(exist_aspect_id.to_owned(), json!("-"));
    Ok(())
}

#[inline]
fn comp_json_extensions_mut(
    parsed: &mut Value,
) -> Result<&mut serde_json::Map<String, Value>, Failure> {
    parsed
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json root object".into()))?
        .entry("extensions")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json extensions missing".into()))
}

#[inline]
fn bitmap_row_config_mut(row: &mut Value) -> Result<&mut serde_json::Map<String, Value>, Failure> {
    row.as_object_mut()
        .ok_or_else(|| Failure::Declined("bitmap row object".into()))?
        .entry("config")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("bitmap config object".into()))
}

fn remove_bitmap_config_key(row: &mut Value, bare_aspect: &str) -> Result<bool, Failure> {
    let Some(cfg_obj) = row.get_mut("config").and_then(Value::as_object_mut) else {
        return Ok(false);
    };
    let Some(found_key) = find_matching_aspect_key(cfg_obj, bare_aspect) else {
        return Ok(false);
    };
    if cfg_obj
        .get(&found_key)
        .and_then(Value::as_str)
        .map(str::trim)
        == Some("-")
    {
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

#[inline]
fn validate_aspect_target(target_aspect_id: &str) -> Result<(), Failure> {
    if target_aspect_id.trim().is_empty() {
        return Err(Failure::Declined("target aspect id is empty".into()));
    }
    Ok(())
}

#[inline]
pub(in crate::commands) fn serialize_json_preserving_newline(
    original: &str,
    parsed: &Value,
) -> Result<Vec<u8>, Failure> {
    let newline = if original.contains("\r\n") { "\r\n" } else { "\n" };
    let pretty =
        serde_json::to_string_pretty(parsed).map_err(|err| Failure::Declined(err.to_string()))?;
    let body = if newline == "\r\n" { pretty.replace('\n', "\r\n") } else { pretty };
    Ok(format!("{body}{newline}").into_bytes())
}
