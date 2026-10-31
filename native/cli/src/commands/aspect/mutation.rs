pub(in crate::commands) use self::{
    comp_json::serialize_json_preserving_newline,
    update::{
        find_component_aspect, resolve_latest_aspect_version, update_in_bitmap_row,
        update_in_comp_json,
    },
};

mod comp_json;
mod update;

use self::{
    comp_json::{apply_set_to_entry, set_in_comp_json, unset_in_bitmap_row, unset_in_comp_json},
    update::{UpdatePlan, prepare_update},
};
use super::{
    Subcommand,
    inspect::get::{collect_get_entries, missing_scope_error, scope_index_lookup},
};
use crate::commands::{
    color::Chalk,
    scope_set::{Failure, selection},
    workspace_command::{self, format::Formatter, results::Report},
};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Map, Value};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(in crate::commands) struct CompJsonEdit {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
}

pub(super) struct BitmapContext {
    pub root: PathBuf,
    pub bitmap: Bitmap,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Value,
    pub chalk: Chalk,
}

pub(super) struct MutationBatch {
    pub root: PathBuf,
    pub aspect_id: String,
    pub ids: Vec<String>,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Value,
    pub bitmap_changed: bool,
    pub comp_json_edits: Vec<CompJsonEdit>,
}

pub(super) enum Prepared {
    Set { pattern: String, batch: MutationBatch },
    Unset { pattern: String, batch: MutationBatch },
    Update(UpdatePlan),
    Unrecognized(String),
}

impl BitmapContext {
    pub(super) fn load(root: &Path, chalk: Chalk) -> Result<Self, Failure> {
        let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
        let bitmap_before = fs::read(root.join(".bitmap"))?;
        let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
        let bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
        let default_scope = workspace_default_scope(&workspace_val)?;
        let bitmap = Bitmap::load(root, Some(&default_scope))?;
        Ok(Self { root: root.to_path_buf(), bitmap, bitmap_before, bitmap_val, chalk })
    }
}

pub(in crate::commands) fn workspace_default_scope(workspace: &Value) -> Result<String, Failure> {
    let rows =
        workspace.as_object().ok_or_else(|| Failure::Declined("workspace.jsonc object".into()))?;
    let key = rows
        .keys()
        .find(|key| key.split('@').next() == Some("teambit.workspace/workspace"))
        .cloned()
        .unwrap_or_else(|| "teambit.workspace/workspace".into());
    let ws = &workspace[&key];
    if ws["bitmapAutoSync"] == true {
        return Err(Failure::Declined("bitmapAutoSync enabled".into()));
    }
    ws["defaultScope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| Failure::Declined("missing defaultScope".into()))
}

pub(super) fn prepare(
    root: &Path,
    subcommand: &Subcommand,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    if let Subcommand::Unrecognized(sub) = subcommand {
        return Ok(Prepared::Unrecognized(sub.clone()));
    }
    let ctx = BitmapContext::load(root, chalk)?;
    match subcommand {
        Subcommand::Set { pattern, aspect_id, config, merge } => {
            prepare_set(ctx, pattern, aspect_id, config, *merge)
        }
        Subcommand::Unset { pattern, aspect_id } => prepare_unset(ctx, pattern, aspect_id),
        Subcommand::Update { aspect_id, pattern } => {
            prepare_update(ctx, aspect_id, pattern.as_deref())
        }
        Subcommand::Unrecognized(sub) => Ok(Prepared::Unrecognized(sub.clone())),
        Subcommand::ListCore { .. } | Subcommand::List(_) | Subcommand::Get(_) => {
            Err(Failure::Declined("handled earlier".into()))
        }
    }
}

fn comp_json_file(root: &Path, entry: &BitmapEntry) -> Option<PathBuf> {
    (!entry.root_dir.is_empty())
        .then(|| root.join(&entry.root_dir).join("component.json"))
        .filter(|path| path.is_file())
}

fn prepare_set(
    mut ctx: BitmapContext,
    pattern: &str,
    aspect_id: &str,
    config: &Value,
    merge: bool,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let (resolved_aspect_id, bare_aspect) =
        resolve_aspect_identity(&ctx.root, &ctx.bitmap, aspect_id)?;
    let mut ids = Vec::with_capacity(matched.len());
    let mut bitmap_changed = false;
    let mut comp_json_edits = Vec::new();
    for entry in matched {
        if let Some(path) = comp_json_file(&ctx.root, entry) {
            comp_json_edits.push(set_in_comp_json(
                path,
                &resolved_aspect_id,
                &bare_aspect,
                config,
                merge,
            )?);
        } else if apply_set_to_entry(
            &mut ctx.bitmap_val,
            entry,
            &resolved_aspect_id,
            &bare_aspect,
            config,
            merge,
        )? {
            bitmap_changed = true;
        }
        ids.push(selection::entry_full_id(entry));
    }
    Ok(Prepared::Set {
        pattern: pattern.to_owned(),
        batch: MutationBatch {
            root: ctx.root,
            aspect_id: resolved_aspect_id,
            ids,
            bitmap_before: ctx.bitmap_before,
            bitmap_val: ctx.bitmap_val,
            bitmap_changed,
            comp_json_edits,
        },
    })
}

fn prepare_unset(
    mut ctx: BitmapContext,
    pattern: &str,
    aspect_id: &str,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let (resolved_aspect_id, bare_aspect) =
        resolve_aspect_identity(&ctx.root, &ctx.bitmap, aspect_id)?;
    let mut ids = Vec::with_capacity(matched.len());
    let mut bitmap_changed = false;
    let mut comp_json_edits = Vec::new();
    for entry in matched {
        let entry_id = entry.id.to_string_without_version();
        let entries = collect_get_entries(&ctx.root, &entry_id, Some(&bare_aspect), ctx.chalk)?;
        let Some(exist) = entries.into_iter().next() else {
            continue;
        };
        if let Some(path) = comp_json_file(&ctx.root, entry) {
            comp_json_edits.push(unset_in_comp_json(path, &bare_aspect, &exist.id)?);
        } else {
            unset_in_bitmap_row(&mut ctx.bitmap_val, entry, &bare_aspect, &exist.id)?;
            bitmap_changed = true;
        }
        ids.push(selection::entry_full_id(entry));
    }
    Ok(Prepared::Unset {
        pattern: pattern.to_owned(),
        batch: MutationBatch {
            root: ctx.root,
            aspect_id: resolved_aspect_id,
            ids,
            bitmap_before: ctx.bitmap_before,
            bitmap_val: ctx.bitmap_val,
            bitmap_changed,
            comp_json_edits,
        },
    })
}

pub(in crate::commands) fn resolve_aspect_identity(
    root: &Path,
    bitmap: &Bitmap,
    raw: &str,
) -> Result<(String, String), Failure> {
    let (bare, ver) = raw
        .rsplit_once('@')
        .map_or((raw, None), |(bare, ver)| (bare, Some(ver)));
    let normalized = bare.trim_start_matches("./").trim_end_matches('/');
    if let Some(entry) = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && (entry.id.to_string_without_version() == bare
                    || entry.id.name == bare
                    || (!entry.root_dir.is_empty() && entry.root_dir == normalized))
        })
    {
        let scoped_bare = entry.id.to_string_without_version();
        let full = ver
            .filter(|ver_str| !ver_str.is_empty() && !matches!(*ver_str, "latest" | "head"))
            .map_or_else(
                || selection::entry_full_id(entry),
                |ver_str| format!("{scoped_bare}@{ver_str}"),
            );
        return Ok((full, scoped_bare));
    }
    if bare.contains('/') {
        return Ok((raw.to_owned(), bare.to_owned()));
    }
    if let Some(scoped_bare) = scope_index_lookup(root, bare) {
        let full =
            ver.map_or_else(|| scoped_bare.clone(), |ver_str| format!("{scoped_bare}@{ver_str}"));
        return Ok((full, scoped_bare));
    }
    Err(Failure::User(missing_scope_error(raw)))
}

pub(in crate::commands) fn find_matching_aspect_key(
    map: &Map<String, Value>,
    bare_aspect: &str,
) -> Option<String> {
    if map.contains_key(bare_aspect) {
        return Some(bare_aspect.to_owned());
    }
    let prefix = format!("{bare_aspect}@");
    map.keys()
        .find(|key| key.starts_with(&prefix))
        .cloned()
}

pub(in crate::commands) fn find_bitmap_row_mut<'a>(
    bitmap_val: &'a mut Value,
    entry: &BitmapEntry,
) -> Result<&'a mut Value, Failure> {
    let rows =
        bitmap_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap object".into()))?;
    rows.iter_mut()
        .find(|(key, row)| row_matches_entry(key, row, entry))
        .map(|(_, row)| row)
        .ok_or_else(|| Failure::Declined(format!("bitmap entry {}", entry.id.name)))
}

pub(in crate::commands) fn find_bitmap_row_ref<'a>(
    bitmap_val: &'a Value,
    entry: &BitmapEntry,
) -> Result<&'a Value, Failure> {
    let rows = bitmap_val.as_object().ok_or_else(|| Failure::Declined("bitmap object".into()))?;
    rows.iter()
        .find(|(key, row)| row_matches_entry(key, row, entry))
        .map(|(_, row)| row)
        .ok_or_else(|| Failure::Declined(format!("bitmap entry {}", entry.id.name)))
}

fn row_matches_entry(key: &str, row: &Value, entry: &BitmapEntry) -> bool {
    if key.starts_with('$')
        || matches!(key, "_bit_lane" | "version")
        || !row.is_object()
        || row["isAvailableOnCurrentLane"] == false
    {
        return false;
    }
    if !entry.root_dir.is_empty() && row["rootDir"].as_str() == Some(entry.root_dir.as_str()) {
        return true;
    }
    let (row_scope, row_name) = crate::commands::update_cmd::bitmap_row_scope_and_name(key, row);
    let entry_scope = entry.id.scope
        .as_deref()
        .or(entry.id.default_scope.as_deref())
        .unwrap_or_default();
    row_name == entry.id.name
        && (row_scope.is_empty() || entry_scope.is_empty() || row_scope == entry_scope)
}

pub(in crate::commands) fn deep_merge(target: &mut Value, source: &Value) {
    if let (Some(t_obj), Some(s_obj)) = (target.as_object_mut(), source.as_object()) {
        for (key, val) in s_obj {
            if let Some(existing) = t_obj.get_mut(key)
                && existing.is_object()
                && val.is_object()
            {
                deep_merge(existing, val);
            } else {
                t_obj.insert(key.clone(), val.clone());
            }
        }
    } else {
        *target = source.clone();
    }
}

impl Prepared {
    pub(super) fn commit(self, chalk: Chalk) -> io::Result<Report> {
        let formatter = Formatter::new(chalk);
        let is_set = matches!(self, Self::Set { .. });
        let data = match self {
            Self::Set { pattern, batch } | Self::Unset { pattern, batch } => {
                let op = if is_set { "aspect-set" } else { "aspect-unset" };
                persist_aspect_edits(&batch, &format!("{op} ({})", batch.aspect_id))?;
                if batch.ids.is_empty() {
                    formatter.hint(&format!(
                        "unable to find any matching components for {} pattern",
                        chalk.bold(&pattern),
                    ))
                } else {
                    render_updated(&formatter, &batch.ids)
                }
            }
            Self::Update(plan) => plan.commit(&formatter, chalk)?,
            Self::Unrecognized(sub) => chalk.red(&format!(
                r#""{sub}" is not a subcommand of "aspect", please run "bit aspect --help" to list the subcommands"#,
            )),
        };
        Ok(Report { data, code: 0, details: None })
    }
}

fn persist_aspect_edits(batch: &MutationBatch, reason: &str) -> io::Result<()> {
    for edit in &batch.comp_json_edits {
        fs::write(&edit.path, &edit.bytes)?;
    }
    write_bitmap_if_changed(
        &batch.root,
        &batch.bitmap_before,
        &batch.bitmap_val,
        batch.bitmap_changed,
        reason,
    )
}

pub(in crate::commands) fn write_bitmap_if_changed(
    root: &Path,
    bitmap_before: &[u8],
    bitmap_val: &Value,
    bitmap_changed: bool,
    reason: &str,
) -> io::Result<()> {
    if bitmap_changed {
        let file_id = workspace_command::file_id();
        bit_object_import::component_deprecation::write_bitmap(
            root,
            bitmap_before,
            bitmap_val,
            &file_id,
            reason,
        )?;
    }
    Ok(())
}

pub(super) fn render_updated(formatter: &Formatter, ids: &[String]) -> String {
    let items = ids
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>();
    Formatter::join(&[
        formatter.success_summary("the following component(s) have been updated"),
        items.join("\n"),
    ])
}
