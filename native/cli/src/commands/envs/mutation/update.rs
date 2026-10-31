use super::{BitmapContext, CORE_ENVS, CompJsonEdit, Prepared};
use crate::commands::{
    aspect::{
        find_bitmap_row_ref, find_component_aspect, find_matching_aspect_key,
        resolve_aspect_identity, resolve_latest_aspect_version, update_in_bitmap_row,
        update_in_comp_json, write_bitmap_if_changed,
    },
    color::Chalk,
    scope_set::{Failure, selection},
    script::resolve_workspace_components,
    workspace_command::format::Formatter,
};
use bit_install::{
    config::aspect_id_without_version,
    workspace::{Bitmap, BitmapEntry},
};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(in crate::commands::envs) struct EnvUpdatePlan {
    pub root: PathBuf,
    pub raw_env_id: Option<String>,
    pub updated: Vec<(String, Vec<String>)>,
    pub already_up_to_date: usize,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Option<Value>,
    pub comp_json_edits: Vec<CompJsonEdit>,
}

struct TargetEnv {
    bare: String,
    target_ver: Option<String>,
    display_id: String,
    in_ws: bool,
}

impl EnvUpdatePlan {
    pub(super) fn commit(
        self,
        formatter: &Formatter,
        chalk: Chalk,
        install_hint: String,
    ) -> io::Result<String> {
        for edit in self.comp_json_edits {
            fs::write(edit.path, edit.bytes)?;
        }
        if let Some(bitmap_val) = &self.bitmap_val {
            write_bitmap_if_changed(
                &self.root,
                &self.bitmap_before,
                bitmap_val,
                true,
                "env-update",
            )?;
        }
        if !self.updated.is_empty() {
            let mut sections =
                vec![formatter.success_summary("the following component(s) env has been updated")];
            for (env_id, comp_ids) in &self.updated {
                let items = comp_ids
                    .iter()
                    .map(|id| formatter.item(id))
                    .collect::<Vec<_>>()
                    .join("\n");
                sections.push(format!("{}\n{items}", formatter.title(env_id)));
            }
            sections.push(install_hint);
            return Ok(Formatter::join(&sections));
        }
        if self.already_up_to_date > 0 {
            return Ok(formatter.success_summary(&format!(
                "all {} component(s) that use this env are already up to date. nothing to update",
                self.already_up_to_date,
            )));
        }
        let label = self.raw_env_id.as_deref().unwrap_or("undefined");
        Ok(formatter.hint(&format!(
            "unable to find any components using env {}",
            chalk.bold(label),
        )))
    }
}

pub(super) fn prepare_update(
    mut ctx: BitmapContext,
    raw_env_id: Option<&str>,
    pattern: Option<&str>,
) -> Result<Prepared, Failure> {
    let target_envs = resolve_target_envs(&ctx.root, &ctx.bitmap, raw_env_id)?;
    let entries = select_update_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let mut plan = EnvUpdatePlan {
        root: ctx.root.clone(),
        raw_env_id: raw_env_id.map(str::to_owned),
        updated: Vec::new(),
        already_up_to_date: 0,
        bitmap_before: ctx.bitmap_before,
        bitmap_val: None,
        comp_json_edits: Vec::new(),
    };
    let mut bitmap_changed = false;
    for entry in entries {
        if apply_env_update_to_entry(
            &ctx.root,
            &mut ctx.bitmap_val,
            entry,
            &target_envs,
            &mut plan,
        )? {
            bitmap_changed = true;
        }
    }
    if bitmap_changed {
        plan.bitmap_val = Some(ctx.bitmap_val);
    }
    Ok(Prepared::Update(plan))
}

fn resolve_target_envs(
    root: &Path,
    bitmap: &Bitmap,
    raw_env_id: Option<&str>,
) -> Result<Vec<TargetEnv>, Failure> {
    if let Some(raw) = raw_env_id {
        return Ok(vec![resolve_single_target_env(root, bitmap, raw, false)?]);
    }
    let (_, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let mut seen_bares = Vec::new();
    let mut targets = Vec::new();
    for (entry, comp) in ws.active() {
        let bare = aspect_id_without_version(&comp.env_id);
        if CORE_ENVS.contains(&bare)
            || seen_bares
                .iter()
                .any(|item| item == bare)
        {
            continue;
        }
        if !comp.env_id.contains('@')
            && !workspace_env_has_version(bitmap, bare)
            && !entry_has_versioned_env_in_scope(root, entry, bare)
        {
            continue;
        }
        seen_bares.push(bare.to_owned());
        targets.push(resolve_single_target_env(root, bitmap, bare, true)?);
    }
    Ok(targets)
}

fn resolve_single_target_env(
    root: &Path,
    bitmap: &Bitmap,
    raw: &str,
    from_list: bool,
) -> Result<TargetEnv, Failure> {
    let (_, bare) = resolve_aspect_identity(root, bitmap, raw)?;
    let ws_entry = bitmap.entries
        .iter()
        .find(|entry| entry.owns_its_dir() && entry.id.to_string_without_version() == bare);
    if let Some((_, ver)) = raw
        .split_once('@')
        .filter(|(_, ver)| !ver.is_empty())
    {
        return Ok(TargetEnv {
            display_id: format!("{bare}@{ver}"),
            bare,
            target_ver: Some(ver.to_owned()),
            in_ws: ws_entry.is_some(),
        });
    }
    if let Some(entry) = ws_entry {
        let display_id = if from_list { bare.clone() } else { selection::entry_full_id(entry) };
        return Ok(TargetEnv {
            bare,
            target_ver: entry.id.version
                .clone()
                .filter(|ver| !ver.is_empty()),
            display_id,
            in_ws: true,
        });
    }
    let ver = resolve_latest_aspect_version(root, &bare)
        .ok_or_else(|| Failure::User(format!("unable to find {raw} in the remote")))?;
    Ok(TargetEnv { display_id: format!("{bare}@{ver}"), bare, target_ver: Some(ver), in_ws: false })
}

fn workspace_env_has_version(bitmap: &Bitmap, bare: &str) -> bool {
    bitmap.entries
        .iter()
        .any(|entry| {
            entry.owns_its_dir()
                && entry.id.to_string_without_version() == bare
                && entry.id.version
                    .as_deref()
                    .is_some_and(|ver| !ver.is_empty())
        })
}

fn entry_has_versioned_env_in_scope(root: &Path, entry: &BitmapEntry, bare: &str) -> bool {
    find_component_aspect(root, &Value::Null, entry, bare).is_some_and(|(ver, _)| ver.is_some())
}

fn select_update_entries<'a>(
    root: &Path,
    bitmap: &'a Bitmap,
    pattern: Option<&str>,
    chalk: Chalk,
) -> Result<Vec<&'a BitmapEntry>, Failure> {
    match pattern {
        Some(pat) => selection::resolve_pattern_entries(root, bitmap, pat, chalk),
        None => Ok(bitmap.entries
            .iter()
            .filter(|entry| entry.owns_its_dir())
            .collect()),
    }
}

fn apply_env_update_to_entry(
    root: &Path,
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    target_envs: &[TargetEnv],
    plan: &mut EnvUpdatePlan,
) -> Result<bool, Failure> {
    let Some((target, curr_ver, cfg_val)) = target_envs
        .iter()
        .find_map(|target| {
            find_component_aspect(root, bitmap_val, entry, &target.bare)
                .map(|(ver, cfg)| (target, ver, cfg))
        })
    else {
        return Ok(false);
    };
    if !target.in_ws && curr_ver.as_deref() == target.target_ver.as_deref() {
        plan.already_up_to_date += 1;
        return Ok(false);
    }
    if target.in_ws && !has_versioned_specific_config(root, bitmap_val, entry, &target.bare) {
        plan.already_up_to_date += 1;
        return Ok(false);
    }
    let write_key = if target.in_ws { target.bare.as_str() } else { target.display_id.as_str() };
    let bitmap_changed =
        write_updated_env(root, bitmap_val, entry, &target.bare, write_key, &cfg_val, plan)?;
    record_updated(&mut plan.updated, &target.display_id, selection::entry_full_id(entry));
    Ok(bitmap_changed)
}

fn has_versioned_specific_config(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
    bare: &str,
) -> bool {
    if !entry.root_dir.is_empty() {
        let comp_json = root.join(&entry.root_dir).join("component.json");
        if let Ok(bytes) = fs::read(comp_json)
            && let Ok(parsed) = bit_object_import::parse_jsonc(&bytes)
            && let Some(ext_obj) = parsed["extensions"].as_object()
        {
            return find_matching_aspect_key(ext_obj, bare)
                .is_some_and(|key| {
                    key.contains('@') && ext_obj.get(&key) != Some(&Value::String("-".into()))
                });
        }
    }
    find_bitmap_row_ref(bitmap_val, entry)
        .ok()
        .and_then(|row| row["config"].as_object())
        .and_then(|cfg_obj| {
            let key = find_matching_aspect_key(cfg_obj, bare)?;
            (key.contains('@') && cfg_obj.get(&key) != Some(&Value::String("-".into()))).then_some(
                (),
            )
        })
        .is_some()
}

fn write_updated_env(
    root: &Path,
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    bare: &str,
    write_key: &str,
    cfg_val: &Value,
    plan: &mut EnvUpdatePlan,
) -> Result<bool, Failure> {
    let comp_json_path = (!entry.root_dir.is_empty())
        .then(|| root.join(&entry.root_dir).join("component.json"))
        .filter(|path| path.is_file());
    if let Some(path) = comp_json_path {
        plan.comp_json_edits.push(update_in_comp_json(path, bare, write_key, cfg_val)?);
        Ok(false)
    } else {
        update_in_bitmap_row(bitmap_val, entry, bare, write_key, cfg_val)?;
        Ok(true)
    }
}

fn record_updated(updated: &mut Vec<(String, Vec<String>)>, env_id: &str, comp_id: String) {
    if let Some((_, list)) = updated
        .iter_mut()
        .find(|(key, _)| key == env_id)
    {
        list.push(comp_id);
    } else {
        updated.push((env_id.to_owned(), vec![comp_id]));
    }
}
