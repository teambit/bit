use super::{
    BitmapContext, CORE_ENVS, EnvBatch, Prepared, set_env_in_bitmap_row, set_env_in_comp_json,
};
use crate::commands::{
    aspect::find_bitmap_row_ref,
    scope_set::{Failure, selection},
};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Map, Value};
use std::{fs, path::Path};

pub(super) fn prepare_replace(
    mut ctx: BitmapContext,
    old_env: &str,
    new_env: &str,
) -> Result<Prepared, Failure> {
    let (env_display_id, env_no_ver) =
        resolve_verified_env(&ctx.root, &ctx.bitmap, &ctx.bitmap_val, new_env)?;
    let old_bare = resolve_old_env_bare(&ctx.bitmap, old_env);
    let mut ids = Vec::new();
    let mut bitmap_changed = false;
    let mut comp_json_edits = Vec::new();
    for entry in ctx.bitmap.entries.iter().filter(|entry| entry.owns_its_dir()) {
        if !entry_uses_env(&ctx.root, &ctx.bitmap_val, entry, &old_bare, old_env) {
            continue;
        }
        let comp_json_path = (!entry.root_dir.is_empty())
            .then(|| ctx.root.join(&entry.root_dir).join("component.json"))
            .filter(|path| path.is_file());
        if let Some(path) = comp_json_path {
            comp_json_edits.push(set_env_in_comp_json(path, &env_no_ver)?);
        } else {
            set_env_in_bitmap_row(&mut ctx.bitmap_val, entry, &env_no_ver)?;
            bitmap_changed = true;
        }
        ids.push(selection::entry_full_id(entry));
    }
    if ids.is_empty() {
        return Err(Failure::Declined("no components found for env replace".into()));
    }
    Ok(Prepared::Replace {
        env_display_id,
        batch: EnvBatch {
            root: ctx.root,
            ids,
            bitmap_before: ctx.bitmap_before,
            bitmap_val: ctx.bitmap_val,
            bitmap_changed,
            comp_json_edits,
        },
    })
}

fn resolve_old_env_bare(bitmap: &Bitmap, old_env: &str) -> String {
    let bare = old_env
        .split('@')
        .next()
        .unwrap_or(old_env);
    let normalized = bare.trim_start_matches("./");
    if let Some(entry) = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && ((!entry.root_dir.is_empty() && entry.root_dir == normalized)
                    || entry.id.to_string_without_version() == bare
                    || entry.id.name == bare)
        })
    {
        return entry.id.to_string_without_version();
    }
    bare.to_owned()
}

fn entry_uses_env(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
    old_bare: &str,
    raw_old_env: &str,
) -> bool {
    if !entry.root_dir.is_empty() {
        let comp_json = root.join(&entry.root_dir).join("component.json");
        if let Ok(bytes) = fs::read(comp_json)
            && let Ok(parsed) = serde_json::from_slice::<Value>(&bytes)
            && let Some(ext) = parsed["extensions"].as_object()
        {
            return map_uses_env(ext, old_bare, raw_old_env);
        }
    }
    if let Ok(row) = find_bitmap_row_ref(bitmap_val, entry)
        && let Some(cfg) = row["config"].as_object()
    {
        return map_uses_env(cfg, old_bare, raw_old_env);
    }
    false
}

fn map_uses_env(map: &Map<String, Value>, old_bare: &str, raw_old_env: &str) -> bool {
    if let Some(configured) = map
        .get("teambit.envs/envs")
        .and_then(|val| val["env"].as_str())
    {
        let cfg_bare = configured
            .split('@')
            .next()
            .unwrap_or(configured);
        if configured == raw_old_env || cfg_bare == old_bare {
            return true;
        }
    }
    let prefix = format!("{old_bare}@");
    map.keys()
        .any(|key| key == old_bare || key == raw_old_env || key.starts_with(&prefix))
}

pub(super) fn resolve_verified_env(
    root: &Path,
    bitmap: &Bitmap,
    bitmap_val: &Value,
    raw_env: &str,
) -> Result<(String, String), Failure> {
    if CORE_ENVS.contains(&raw_env) {
        return Ok((raw_env.to_owned(), raw_env.to_owned()));
    }
    let normalized = raw_env.trim_start_matches("./");
    let Some(env_entry) = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && ((!entry.root_dir.is_empty() && entry.root_dir == normalized)
                    || entry.id.to_string_without_version() == raw_env
                    || entry.id.name == raw_env)
        })
    else {
        return Err(Failure::Declined(format!("non-core non-workspace env {raw_env}")));
    };
    if !is_workspace_entry_an_env(root, bitmap_val, env_entry) {
        return Err(Failure::Declined(format!(
            "workspace component {raw_env} not verified as env",
        )));
    }
    Ok((selection::entry_full_id(env_entry), env_entry.id.to_string_without_version()))
}

fn is_workspace_entry_an_env(root: &Path, bitmap_val: &Value, entry: &BitmapEntry) -> bool {
    if let Ok(row) = find_bitmap_row_ref(bitmap_val, entry)
        && is_env_config(&row["config"])
    {
        return true;
    }
    if !entry.root_dir.is_empty() {
        let comp_dir = root.join(&entry.root_dir);
        if let Ok(bytes) = fs::read(comp_dir.join("component.json"))
            && let Ok(parsed) = serde_json::from_slice::<Value>(&bytes)
            && is_env_config(&parsed["extensions"])
        {
            return true;
        }
        if dir_has_bit_env_plugin(&comp_dir) {
            return true;
        }
    }
    false
}

fn is_env_config(cfg: &Value) -> bool {
    let Some(obj) = cfg.as_object() else {
        return false;
    };
    if obj.contains_key("teambit.envs/env")
        || obj
            .keys()
            .any(|key| key.starts_with("bitdev.general/envs/bit-env"))
    {
        return true;
    }
    matches!(
        obj.get("teambit.envs/envs")
            .and_then(|val| val["env"].as_str()),
        Some("teambit.envs/env" | "bitdev.general/envs/bit-env"),
    )
}

fn dir_has_bit_env_plugin(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            if dir_has_bit_env_plugin(&path) {
                return true;
            }
        } else if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.contains(".bit-env."))
        {
            return true;
        }
    }
    false
}
