mod replace;

use self::replace::prepare_replace;
use super::{CORE_ENVS, Subcommand};
use crate::commands::{
    aspect::{
        find_bitmap_row_mut, find_bitmap_row_ref, serialize_json_preserving_newline,
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

pub(super) struct CompJsonEdit {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
}

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
    let mut parsed: Value =
        serde_json::from_str(&content).map_err(|err| Failure::Declined(err.to_string()))?;
    let ext_obj = parsed["extensions"]
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
        let comp_json_path = (!entry.root_dir.is_empty())
            .then(|| ctx.root.join(&entry.root_dir).join("component.json"))
            .filter(|path| path.is_file());
        if let Some(path) = comp_json_path {
            if let Some(edit) = unset_env_in_comp_json(path)? {
                comp_json_edits.push(edit);
                ids.push(selection::entry_full_id(entry));
            }
        } else if unset_env_in_bitmap_row(&mut ctx.bitmap_val, entry)? {
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

fn unset_env_in_comp_json(path: PathBuf) -> Result<Option<CompJsonEdit>, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value =
        serde_json::from_str(&content).map_err(|err| Failure::Declined(err.to_string()))?;
    let ext_obj = parsed["extensions"]
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json extensions".into()))?;
    if remove_env_from_map(ext_obj) {
        let bytes = serialize_json_preserving_newline(&content, &parsed)?;
        return Ok(Some(CompJsonEdit { path, bytes }));
    }
    if !ext_obj.is_empty() {
        return Err(Failure::Declined("component.json non-empty without envs/envs".into()));
    }
    Ok(None)
}

fn unset_env_in_bitmap_row(bitmap_val: &mut Value, entry: &BitmapEntry) -> Result<bool, Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let Some(cfg_obj) = row.get_mut("config").and_then(Value::as_object_mut) else {
        return Ok(false);
    };
    if remove_env_from_map(cfg_obj) {
        let is_empty = cfg_obj.is_empty();
        if is_empty && let Some(row_obj) = row.as_object_mut() {
            row_obj.remove("config");
        }
        return Ok(true);
    }
    if !cfg_obj.is_empty() {
        return Err(Failure::Declined("bitmap config non-empty without envs/envs".into()));
    }
    Ok(false)
}

pub(super) fn remove_env_from_map(map: &mut Map<String, Value>) -> bool {
    let Some(curr_env) = map
        .get("teambit.envs/envs")
        .and_then(|val| val["env"].as_str())
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
    else {
        return false;
    };
    map.remove(&curr_env);
    let prefix = format!("{curr_env}@");
    let versioned_keys = map
        .keys()
        .filter(|key| key.starts_with(&prefix))
        .cloned()
        .collect::<Vec<_>>();
    for key in versioned_keys {
        map.remove(&key);
    }
    map.remove("teambit.envs/envs");
    true
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
