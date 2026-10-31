mod replace;
mod update;

use self::{
    replace::{prepare_replace, resolve_verified_env},
    update::{EnvUpdatePlan, prepare_update},
};
use super::{CORE_ENVS, Subcommand};
use crate::commands::{
    aspect::{
        CompJsonEdit, find_bitmap_row_mut, serialize_json_preserving_newline,
        workspace_default_scope, write_bitmap_if_changed,
    },
    color::Chalk,
    scope_set::{Failure, selection},
    workspace_command::{format::Formatter, results::Report},
};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Map, Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct EnvBatch {
    pub root: PathBuf,
    pub ids: Vec<String>,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Value,
    pub bitmap_changed: bool,
    pub comp_json_edits: Vec<CompJsonEdit>,
}

pub(super) enum Prepared {
    Set { env_display_id: String, batch: EnvBatch },
    Unset(EnvBatch),
    Replace { env_display_id: String, batch: EnvBatch },
    Update(EnvUpdatePlan),
}

pub(super) struct BitmapContext {
    pub root: PathBuf,
    pub bitmap: Bitmap,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Value,
    pub chalk: Chalk,
}

impl BitmapContext {
    fn load(root: &Path, chalk: Chalk) -> Result<Self, Failure> {
        let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
        let bitmap_before = fs::read(root.join(".bitmap"))?;
        let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
        let bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
        let default_scope = workspace_default_scope(&workspace_val)?;
        let bitmap = Bitmap::load(root, Some(&default_scope))?;
        Ok(Self { root: root.to_path_buf(), bitmap, bitmap_before, bitmap_val, chalk })
    }
}

pub(super) fn prepare(
    root: &Path,
    subcommand: &Subcommand,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let ctx = BitmapContext::load(root, chalk)?;
    match subcommand {
        Subcommand::Set { pattern, env } => prepare_set(ctx, pattern, env),
        Subcommand::Unset { pattern } => prepare_unset(ctx, pattern),
        Subcommand::Replace { old_env, new_env } => prepare_replace(ctx, old_env, new_env),
        Subcommand::Update { env_id, pattern } => {
            prepare_update(ctx, env_id.as_deref(), pattern.as_deref())
        }
        Subcommand::List { .. } | Subcommand::Get { .. } => {
            Err(Failure::Declined("handled by inspect".into()))
        }
    }
}

fn prepare_set(mut ctx: BitmapContext, pattern: &str, env: &str) -> Result<Prepared, Failure> {
    let (env_display_id, env_no_ver) =
        resolve_verified_env(&ctx.root, &ctx.bitmap, &ctx.bitmap_val, env)?;
    let matched = selection::resolve_pattern_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let mut ids = Vec::with_capacity(matched.len());
    let mut bitmap_changed = false;
    let mut comp_json_edits = Vec::new();
    for entry in matched {
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
    Ok(Prepared::Set {
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

pub(super) fn set_env_in_comp_json(
    path: PathBuf,
    env_no_ver: &str,
) -> Result<CompJsonEdit, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value = bit_object_import::parse_jsonc(content.as_bytes())?;
    let root_obj = parsed
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json root object".into()))?;
    let ext_obj = root_obj
        .entry("extensions")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json extensions".into()))?;
    remove_env_from_map(ext_obj);
    ext_obj.insert(env_no_ver.to_owned(), json!({}));
    ext_obj.insert("teambit.envs/envs".into(), json!({ "env": env_no_ver }));
    Ok(CompJsonEdit { path, bytes: serialize_json_preserving_newline(&content, &parsed)? })
}

pub(super) fn set_env_in_bitmap_row(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    env_no_ver: &str,
) -> Result<(), Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg_val = row_obj
        .entry("config")
        .or_insert_with(|| json!({}));
    let cfg_obj =
        cfg_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    remove_env_from_map(cfg_obj);
    cfg_obj.insert(env_no_ver.to_owned(), json!({}));
    cfg_obj.insert("teambit.envs/envs".into(), json!({ "env": env_no_ver }));
    Ok(())
}

fn prepare_unset(mut ctx: BitmapContext, pattern: &str) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let mut ids = Vec::new();
    let mut bitmap_changed = false;
    let mut comp_json_edits = Vec::new();
    for entry in matched {
        let model_env = find_model_env(&ctx.root, entry)?;
        let comp_json_path = (!entry.root_dir.is_empty())
            .then(|| ctx.root.join(&entry.root_dir).join("component.json"))
            .filter(|path| path.is_file());
        if let Some(path) = comp_json_path {
            if let Some(edit) = unset_env_in_comp_json(path, model_env.as_deref())? {
                comp_json_edits.push(edit);
                ids.push(selection::entry_full_id(entry));
            }
        } else if unset_env_in_bitmap_row(&mut ctx.bitmap_val, entry, model_env.as_deref())? {
            bitmap_changed = true;
            ids.push(selection::entry_full_id(entry));
        }
    }
    Ok(Prepared::Unset(EnvBatch {
        root: ctx.root,
        ids,
        bitmap_before: ctx.bitmap_before,
        bitmap_val: ctx.bitmap_val,
        bitmap_changed,
        comp_json_edits,
    }))
}

fn unset_env_in_comp_json(
    path: PathBuf,
    fallback_env: Option<&str>,
) -> Result<Option<CompJsonEdit>, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value = bit_object_import::parse_jsonc(content.as_bytes())?;
    let Some(ext_obj) = parsed.get_mut("extensions").and_then(Value::as_object_mut) else {
        return Ok(None);
    };
    if remove_env_from_map_with_fallback(ext_obj, fallback_env) {
        let bytes = serialize_json_preserving_newline(&content, &parsed)?;
        return Ok(Some(CompJsonEdit { path, bytes }));
    }
    Ok(None)
}

fn unset_env_in_bitmap_row(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    fallback_env: Option<&str>,
) -> Result<bool, Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let Some(cfg_obj) = row.get_mut("config").and_then(Value::as_object_mut) else {
        return Ok(false);
    };
    if remove_env_from_map_with_fallback(cfg_obj, fallback_env) {
        let is_empty = cfg_obj.is_empty();
        if is_empty && let Some(row_obj) = row.as_object_mut() {
            row_obj.remove("config");
        }
        return Ok(true);
    }
    Ok(false)
}

pub(super) fn remove_env_from_map(map: &mut Map<String, Value>) -> bool {
    remove_env_from_map_with_fallback(map, None)
}

fn remove_env_from_map_with_fallback(
    map: &mut Map<String, Value>,
    fallback_env: Option<&str>,
) -> bool {
    let envs_entry = map
        .iter()
        .find(|(key, _)| {
            key.as_str() == "teambit.envs/envs" || key.starts_with("teambit.envs/envs@")
        });
    let curr_env = match envs_entry.map(|(_, val)| val) {
        Some(val) if val.as_str() == Some("-") => None,
        Some(val) => val["env"]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        None => fallback_env
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
    };
    let Some(curr_env) = curr_env else {
        return false;
    };
    let bare_env = curr_env
        .split('@')
        .next()
        .unwrap_or(&curr_env);
    let mut any_removed = map.remove(&curr_env).is_some() | map.remove(bare_env).is_some();
    let prefix = format!("{bare_env}@");
    let versioned_keys = map
        .keys()
        .filter(|key| {
            key.starts_with(&prefix)
                || key.as_str() == "teambit.envs/envs"
                || key.starts_with("teambit.envs/envs@")
        })
        .cloned()
        .collect::<Vec<_>>();
    for key in versioned_keys {
        any_removed |= map.remove(&key).is_some();
    }
    any_removed
}

fn find_model_env(root: &Path, entry: &BitmapEntry) -> Result<Option<String>, Failure> {
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return Ok(None);
    };
    let Some(scope) = bit_install::policy::scope::Scope::find(root) else {
        return Err(Failure::Declined("missing scope for versioned entry".into()));
    };
    let ver_obj = scope
        .version(&entry.id.to_string_without_version(), Some(ver))
        .map_err(|err| Failure::Declined(err.to_string()))?
        .ok_or_else(|| Failure::Declined("missing Version object in scope".into()))?;
    let Some(exts) = ver_obj["extensions"].as_array() else {
        return Ok(None);
    };
    Ok(exts
        .iter()
        .find(|ext| crate::commands::update_cmd::matches_aspect(ext, "teambit.envs/envs"))
        .and_then(|ext| {
            ext["config"]["env"]
                .as_str()
                .or_else(|| ext["data"]["id"].as_str())
        })
        .filter(|env| !env.trim().is_empty() && *env != "-")
        .map(str::to_owned))
}

impl EnvBatch {
    fn persist(&self, reason: &str) -> io::Result<()> {
        for edit in &self.comp_json_edits {
            fs::write(&edit.path, &edit.bytes)?;
        }
        write_bitmap_if_changed(
            &self.root,
            &self.bitmap_before,
            &self.bitmap_val,
            self.bitmap_changed,
            reason,
        )
    }
}

impl Prepared {
    pub(super) fn commit(self, chalk: Chalk) -> io::Result<Report> {
        let formatter = Formatter::new(chalk);
        let install_hint =
            formatter.hint("please run 'bit install' for the changes to take effect");
        let data = match self {
            Self::Set { env_display_id, batch } => {
                batch.persist(&format!("env-set ({env_display_id})"))?;
                Formatter::join(&[
                    formatter.success_summary(&format!(
                        "assigned {} env to the following component(s)",
                        chalk.bold(&env_display_id),
                    )),
                    render_items(&formatter, &batch.ids),
                    install_hint,
                ])
            }
            Self::Unset(batch) => commit_unset(&batch, &formatter, install_hint)?,
            Self::Replace { env_display_id, batch } => {
                batch.persist(&format!("env-set ({env_display_id})"))?;
                format!(
                    "added {} env to the following component(s):\n{}\n\n{install_hint}",
                    chalk.bold(&env_display_id),
                    batch.ids.join("\n"),
                )
            }
            Self::Update(plan) => plan.commit(&formatter, chalk, install_hint)?,
        };
        Ok(Report { data, code: 0, details: None })
    }
}

fn commit_unset(
    batch: &EnvBatch,
    formatter: &Formatter,
    install_hint: String,
) -> io::Result<String> {
    batch.persist("env-unset")?;
    if batch.ids.is_empty() {
        return Ok(formatter.hint(
            "unable to find components matching the pattern with env configured in the .bitmap file",
        ));
    }
    Ok(Formatter::join(&[
        formatter.success_summary(
            "removed .bitmap env configuration from the following component(s)",
        ),
        render_items(formatter, &batch.ids),
        install_hint,
    ]))
}

fn render_items(formatter: &Formatter, ids: &[String]) -> String {
    ids.iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>()
        .join("\n")
}
