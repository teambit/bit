use super::{
    BitmapContext, EnvBatch, Prepared, resolve_verified_env, set_env_in_bitmap_row,
    set_env_in_comp_json,
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
