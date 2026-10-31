use super::{
    BitmapContext, CORE_ENVS, EnvBatch, Prepared, set_env_in_bitmap_row, set_env_in_comp_json,
};
use crate::commands::{
    aspect::find_bitmap_row_ref,
    scope_set::{Failure, selection},
    script::resolve_workspace_components,
};
use bit_install::{
    config::aspect_id_without_version,
    workspace::{Bitmap, BitmapEntry},
};
use serde_json::{Map, Value};
use std::{fs, path::Path};

pub(super) fn prepare_replace(
    ctx: BitmapContext,
    old_env: &str,
    new_env: &str,
) -> Result<Prepared, Failure> {
    let (env_display_id, env_no_ver) =
        resolve_verified_env(&ctx.root, &ctx.bitmap, &ctx.bitmap_val, new_env)?;
    let old_bare = resolve_old_env_bare(&ctx.bitmap, old_env);
    let (_, ws) =
        resolve_workspace_components(&ctx.root).map_err(|err| Failure::Declined(err.to_string()))?;
    let mut batch = EnvBatch {
        root: ctx.root,
        ids: Vec::new(),
        bitmap_before: ctx.bitmap_before,
        bitmap_val: ctx.bitmap_val,
        bitmap_changed: false,
        comp_json_edits: Vec::new(),
    };
    let mut available_envs = Vec::new();
    for (entry, comp) in ws.active() {
        if component_matches_old_env(
            &batch.root,
            &batch.bitmap_val,
            entry,
            &comp.env_id,
            &old_bare,
            old_env,
        ) {
            apply_replace_to_entry(&mut batch, entry, &env_no_ver)?;
        } else {
            record_available_env(&mut available_envs, &comp.env_id);
        }
    }
    ensure_replaced_components(&batch.ids, old_env, &available_envs)?;
    Ok(Prepared::Replace { env_display_id, batch })
}

fn record_available_env(available_envs: &mut Vec<String>, env_id: &str) {
    let env_id = env_id.trim();
    if !env_id.is_empty()
        && !available_envs
            .iter()
            .any(|item| item == env_id)
    {
        available_envs.push(env_id.to_owned());
    }
}

fn apply_replace_to_entry(
    batch: &mut EnvBatch,
    entry: &BitmapEntry,
    env_no_ver: &str,
) -> Result<(), Failure> {
    if let Some(path) = comp_json_file(&batch.root, entry) {
        batch.comp_json_edits.push(set_env_in_comp_json(path, env_no_ver)?);
    } else {
        set_env_in_bitmap_row(&mut batch.bitmap_val, entry, env_no_ver)?;
        batch.bitmap_changed = true;
    }
    batch.ids.push(selection::entry_full_id(entry));
    Ok(())
}

fn ensure_replaced_components(
    ids: &[String],
    old_env: &str,
    available_envs: &[String],
) -> Result<(), Failure> {
    if ids.is_empty() {
        return Err(Failure::User(format!(
            "unable to find components that use \"{old_env}\" env.\nthe following envs are used in this workspace: {}",
            available_envs.join(", "),
        )));
    }
    Ok(())
}

fn comp_json_file(root: &Path, entry: &BitmapEntry) -> Option<std::path::PathBuf> {
    (!entry.root_dir.is_empty())
        .then(|| root.join(&entry.root_dir).join("component.json"))
        .filter(|path| path.is_file())
}

fn component_matches_old_env(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
    comp_env_id: &str,
    old_bare: &str,
    raw_old_env: &str,
) -> bool {
    let comp_bare = aspect_id_without_version(comp_env_id);
    raw_old_env == comp_env_id
        || raw_old_env == comp_bare
        || old_bare == comp_bare
        || entry_uses_env(root, bitmap_val, entry, old_bare, raw_old_env)
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
            && let Ok(parsed) = bit_object_import::parse_jsonc(&bytes)
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
        .iter()
        .find(|(key, _)| {
            key.as_str() == "teambit.envs/envs" || key.starts_with("teambit.envs/envs@")
        })
        .and_then(|(_, val)| val["env"].as_str())
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
    let raw_env = raw_env.trim();
    let bare_env = raw_env.rsplit_once('@').map_or(raw_env, |(bare, _)| bare.trim());
    if bare_env.is_empty() {
        return Err(Failure::Declined("empty env identifier".into()));
    }
    if CORE_ENVS.contains(&bare_env) {
        return Ok((bare_env.to_owned(), bare_env.to_owned()));
    }
    let normalized = bare_env.trim_start_matches("./");
    let Some(env_entry) = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && ((!entry.root_dir.is_empty() && entry.root_dir == normalized)
                    || entry.id.to_string_without_version() == bare_env
                    || entry.id.name == bare_env)
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
            && let Ok(parsed) = bit_object_import::parse_jsonc(&bytes)
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
    if obj
        .keys()
        .any(|key| {
            key == "teambit.envs/env"
                || key.starts_with("teambit.envs/env@")
                || key.starts_with("bitdev.general/envs/bit-env")
        })
    {
        return true;
    }
    obj.iter()
        .find(|(key, _)| {
            key.as_str() == "teambit.envs/envs" || key.starts_with("teambit.envs/envs@")
        })
        .and_then(|(_, val)| val["env"].as_str())
        .map(|env| env.split('@').next().unwrap_or(env))
        .is_some_and(|bare| matches!(bare, "teambit.envs/env" | "bitdev.general/envs/bit-env"))
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
