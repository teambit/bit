use super::{Subcommand, is_supported_pattern};
use crate::commands::{
    color::Chalk,
    scope_set::{Failure, selection},
    workspace_command::{self, format::Formatter, results::Report},
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

pub(super) struct BitmapContext {
    pub root: PathBuf,
    pub bitmap: Bitmap,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Value,
    pub chalk: Chalk,
}

pub(super) enum Prepared {
    Set {
        root: PathBuf,
        aspect_id: String,
        ids: Vec<String>,
        bitmap_before: Vec<u8>,
        bitmap_val: Value,
        bitmap_changed: bool,
    },
    Unset {
        root: PathBuf,
        aspect_id: String,
        ids: Vec<String>,
        bitmap_before: Vec<u8>,
        bitmap_val: Value,
        bitmap_changed: bool,
        comp_json_edits: Vec<CompJsonEdit>,
    },
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
        Subcommand::Unrecognized(sub) => Ok(Prepared::Unrecognized(sub.clone())),
        Subcommand::ListCore { .. } => Err(Failure::Declined("handled earlier".into())),
    }
}

fn prepare_set(
    mut ctx: BitmapContext,
    pattern: &str,
    aspect_id: &str,
    config: &Value,
    merge: bool,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let mut ids = Vec::with_capacity(matched.len());
    let mut bitmap_changed = false;
    for entry in matched {
        if apply_set_to_entry(&ctx.root, &mut ctx.bitmap_val, entry, aspect_id, config, merge)? {
            bitmap_changed = true;
        }
        ids.push(selection::entry_full_id(entry));
    }
    Ok(Prepared::Set {
        root: ctx.root,
        aspect_id: aspect_id.to_owned(),
        ids,
        bitmap_before: ctx.bitmap_before,
        bitmap_val: ctx.bitmap_val,
        bitmap_changed,
    })
}

fn apply_set_to_entry(
    root: &Path,
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    aspect_id: &str,
    config: &Value,
    merge: bool,
) -> Result<bool, Failure> {
    if !entry.root_dir.is_empty()
        && root
            .join(&entry.root_dir)
            .join("component.json")
            .exists()
    {
        return Err(Failure::Declined("component.json exists on aspect set".into()));
    }
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let current = row
        .get("config")
        .and_then(|cfg| cfg.get(aspect_id));
    if current == Some(config) {
        return Ok(false);
    }
    let new_cfg = match (merge, current) {
        (true, Some(existing)) if existing.is_object() => {
            let mut merged = existing.clone();
            deep_merge(&mut merged, config);
            merged
        }
        _ => config.clone(),
    };
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg_val = row_obj
        .entry("config")
        .or_insert_with(|| json!({}));
    let cfg_obj =
        cfg_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    cfg_obj.insert(aspect_id.to_owned(), new_cfg);
    Ok(true)
}

fn prepare_unset(
    mut ctx: BitmapContext,
    pattern: &str,
    aspect_id: &str,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let (resolved_aspect_id, bare_aspect) = resolve_aspect_identity(&ctx.bitmap, aspect_id)?;
    let mut ids = Vec::with_capacity(matched.len());
    let mut bitmap_changed = false;
    let mut comp_json_edits = Vec::new();
    for entry in matched {
        let comp_json_path = (!entry.root_dir.is_empty())
            .then(|| ctx.root.join(&entry.root_dir).join("component.json"))
            .filter(|path| path.is_file());
        if let Some(path) = comp_json_path {
            comp_json_edits.push(unset_in_comp_json(path, &bare_aspect)?);
        } else {
            unset_in_bitmap_row(&mut ctx.bitmap_val, entry, &bare_aspect)?;
            bitmap_changed = true;
        }
        ids.push(selection::entry_full_id(entry));
    }
    Ok(Prepared::Unset {
        root: ctx.root,
        aspect_id: resolved_aspect_id,
        ids,
        bitmap_before: ctx.bitmap_before,
        bitmap_val: ctx.bitmap_val,
        bitmap_changed,
        comp_json_edits,
    })
}

fn unset_in_comp_json(path: PathBuf, bare_aspect: &str) -> Result<CompJsonEdit, Failure> {
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

fn unset_in_bitmap_row(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    bare_aspect: &str,
) -> Result<(), Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let Some(cfg_obj) = row.get_mut("config").and_then(Value::as_object_mut) else {
        return Err(Failure::Declined("aspect not in bitmap config".into()));
    };
    let Some(found_key) = find_matching_aspect_key(cfg_obj, bare_aspect) else {
        return Err(Failure::Declined("aspect not in bitmap config".into()));
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
    Ok(())
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

fn resolve_aspect_identity(bitmap: &Bitmap, raw: &str) -> Result<(String, String), Failure> {
    let bare = raw.split('@').next().unwrap_or(raw);
    if let Some(entry) = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && (entry.id.to_string_without_version() == bare || entry.id.name == bare)
        })
    {
        return Ok((selection::entry_full_id(entry), entry.id.to_string_without_version()));
    }
    if bare.contains('/') && is_supported_pattern(bare) {
        return Ok((raw.to_owned(), bare.to_owned()));
    }
    if bare.contains('/') {
        return Ok((raw.to_owned(), bare.to_owned()));
    }
    Err(Failure::Declined("unscoped non-workspace aspect id".into()))
}

fn find_matching_aspect_key(map: &Map<String, Value>, bare_aspect: &str) -> Option<String> {
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
    if !entry.root_dir.is_empty() && row["rootDir"].as_str() == Some(entry.root_dir.as_str()) {
        return true;
    }
    row["name"].as_str().unwrap_or(key) == entry.id.name
}

pub(super) fn deep_merge(target: &mut Value, source: &Value) {
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
        let data = match self {
            Self::Set { root, aspect_id, ids, bitmap_before, bitmap_val, bitmap_changed } => {
                write_bitmap_if_changed(
                    &root,
                    &bitmap_before,
                    &bitmap_val,
                    bitmap_changed,
                    &format!("aspect-set ({aspect_id})"),
                )?;
                render_updated(&formatter, &ids)
            }
            Self::Unset {
                root,
                aspect_id,
                ids,
                bitmap_before,
                bitmap_val,
                bitmap_changed,
                comp_json_edits,
            } => {
                for edit in comp_json_edits {
                    fs::write(edit.path, edit.bytes)?;
                }
                write_bitmap_if_changed(
                    &root,
                    &bitmap_before,
                    &bitmap_val,
                    bitmap_changed,
                    &format!("aspect-unset ({aspect_id})"),
                )?;
                render_updated(&formatter, &ids)
            }
            Self::Unrecognized(sub) => chalk.red(&format!(
                r#""{sub}" is not a subcommand of "aspect", please run "bit aspect --help" to list the subcommands"#,
            )),
        };
        Ok(Report { data, code: 0, details: None })
    }
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

fn render_updated(formatter: &Formatter, ids: &[String]) -> String {
    let items = ids
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>();
    Formatter::join(&[
        formatter.success_summary("the following component(s) have been updated"),
        items.join("\n"),
    ])
}
