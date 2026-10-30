use super::{
    BitmapContext, CompJsonEdit, Prepared, find_bitmap_row_mut, find_bitmap_row_ref,
    find_matching_aspect_key, render_updated, resolve_aspect_identity,
    serialize_json_preserving_newline, write_bitmap_if_changed,
};
use crate::commands::{
    color::Chalk,
    scope_set::{Failure, selection},
    workspace_command::format::Formatter,
};
use bit_install::workspace::BitmapEntry;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(in crate::commands::aspect) struct UpdatePlan {
    pub root: PathBuf,
    pub raw_aspect_id: String,
    pub target_aspect_id: String,
    pub updated: Vec<String>,
    pub already_up_to_date: usize,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Option<Value>,
    pub comp_json_edits: Vec<CompJsonEdit>,
}

impl UpdatePlan {
    pub(super) fn commit(self, formatter: &Formatter, chalk: Chalk) -> io::Result<String> {
        for edit in self.comp_json_edits {
            fs::write(edit.path, edit.bytes)?;
        }
        if let Some(bitmap_val) = &self.bitmap_val {
            write_bitmap_if_changed(
                &self.root,
                &self.bitmap_before,
                bitmap_val,
                true,
                &format!("aspect-update ({})", self.target_aspect_id),
            )?;
        }
        if !self.updated.is_empty() {
            return Ok(render_updated(formatter, &self.updated));
        }
        if self.already_up_to_date > 0 {
            return Ok(formatter.success_summary(&format!(
                "all {} component(s) that use this aspect are already up to date. nothing to update",
                self.already_up_to_date,
            )));
        }
        Ok(formatter.hint(&format!(
            "unable to find any components in this workspace that use {}",
            chalk.bold(&self.raw_aspect_id),
        )))
    }
}

pub(super) fn prepare_update(
    mut ctx: BitmapContext,
    raw_aspect_id: &str,
    pattern: Option<&str>,
) -> Result<Prepared, Failure> {
    let (_, bare_aspect) = resolve_aspect_identity(&ctx.root, &ctx.bitmap, raw_aspect_id)?;
    let target_ver = resolve_target_version(&ctx.root, raw_aspect_id, &bare_aspect)?;
    let target_aspect_id = format!("{bare_aspect}@{target_ver}");
    let entries = select_update_entries(&ctx.root, &ctx.bitmap, pattern, ctx.chalk)?;
    let mut plan = UpdatePlan {
        root: ctx.root.clone(),
        raw_aspect_id: raw_aspect_id.to_owned(),
        target_aspect_id: target_aspect_id.clone(),
        updated: Vec::new(),
        already_up_to_date: 0,
        bitmap_before: ctx.bitmap_before,
        bitmap_val: None,
        comp_json_edits: Vec::new(),
    };
    let mut bitmap_changed = false;
    for entry in entries {
        if apply_update_to_entry(
            &ctx.root,
            &mut ctx.bitmap_val,
            entry,
            &bare_aspect,
            &target_ver,
            &target_aspect_id,
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

fn resolve_target_version(
    root: &Path,
    raw_aspect_id: &str,
    bare_aspect: &str,
) -> Result<String, Failure> {
    if let Some((_, ver)) = raw_aspect_id.split_once('@')
        && !ver.is_empty()
    {
        return Ok(ver.to_owned());
    }
    resolve_latest_aspect_version(root, bare_aspect).ok_or_else(|| {
        Failure::User(format!(
            "unable to find {raw_aspect_id} in the remote. if this is a local aspect, please provide a version with your aspect ({raw_aspect_id}) to update to",
        ))
    })
}

fn select_update_entries<'a>(
    root: &Path,
    bitmap: &'a bit_install::workspace::Bitmap,
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

fn apply_update_to_entry(
    root: &Path,
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    bare_aspect: &str,
    target_ver: &str,
    target_aspect_id: &str,
    plan: &mut UpdatePlan,
) -> Result<bool, Failure> {
    let Some((curr_ver, cfg_val)) = find_component_aspect(root, bitmap_val, entry, bare_aspect)
    else {
        return Ok(false);
    };
    if curr_ver.as_deref() == Some(target_ver) {
        plan.already_up_to_date += 1;
        return Ok(false);
    }
    let comp_json_path = (!entry.root_dir.is_empty())
        .then(|| root.join(&entry.root_dir).join("component.json"))
        .filter(|path| path.is_file());
    let bitmap_changed = if let Some(path) = comp_json_path {
        plan.comp_json_edits.push(update_in_comp_json(
            path,
            bare_aspect,
            target_aspect_id,
            &cfg_val,
        )?);
        false
    } else {
        update_in_bitmap_row(bitmap_val, entry, bare_aspect, target_aspect_id, &cfg_val)?;
        true
    };
    plan.updated.push(selection::entry_full_id(entry));
    Ok(bitmap_changed)
}

pub(in crate::commands) fn resolve_latest_aspect_version(
    root: &Path,
    bare_aspect: &str,
) -> Option<String> {
    let aspect_scope = bare_aspect.split('/').next()?;
    let hash = bit_install::policy::scope::hex_sha1(bare_aspect.as_bytes());
    for scope_dir in candidate_scope_dirs(root, aspect_scope) {
        if let Some(ver) = read_latest_model_version(&scope_dir, &hash) {
            return Some(ver);
        }
    }
    None
}

fn candidate_scope_dirs(root: &Path, aspect_scope: &str) -> Vec<PathBuf> {
    let local_scope = crate::workspace::scope_path(root);
    let mut dirs = Vec::new();
    if let Some(remote_dir) = remote_file_scope_dir(&local_scope, aspect_scope) {
        dirs.push(remote_dir);
    }
    dirs.push(local_scope);
    dirs
}

fn remote_file_scope_dir(local_scope: &Path, aspect_scope: &str) -> Option<PathBuf> {
    let bytes = fs::read(local_scope.join("scope.json")).ok()?;
    let scope_json = serde_json::from_slice::<Value>(&bytes).ok()?;
    let remote_url = scope_json["remotes"][aspect_scope].as_str()?;
    remote_url.strip_prefix("file://").map(PathBuf::from)
}

fn read_latest_model_version(scope_dir: &Path, hash: &str) -> Option<String> {
    let (kind, model) = bit_object_import::read_scope_object(scope_dir, hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let head = model["head"].as_str()?;
    let Some(versions) = model["versions"].as_object() else {
        return Some(head.to_owned());
    };
    if let Some((tag, _)) = versions
        .iter()
        .find(|(_, ver_hash)| ver_hash.as_str() == Some(head))
    {
        return Some(tag.clone());
    }
    versions
        .iter()
        .next_back()
        .map(|(tag, _)| tag.clone())
        .or_else(|| Some(head.to_owned()))
}

pub(in crate::commands) fn find_component_aspect(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
    bare_aspect: &str,
) -> Option<(Option<String>, Value)> {
    find_aspect_in_bitmap(bitmap_val, entry, bare_aspect)
        .or_else(|| find_aspect_in_comp_json(root, entry, bare_aspect))
        .or_else(|| find_aspect_in_scope_version(root, entry, bare_aspect))
}

fn find_aspect_in_bitmap(
    bitmap_val: &Value,
    entry: &BitmapEntry,
    bare_aspect: &str,
) -> Option<(Option<String>, Value)> {
    let row = find_bitmap_row_ref(bitmap_val, entry).ok()?;
    let cfg_obj = row["config"].as_object()?;
    extract_aspect_from_map(cfg_obj, bare_aspect)
}

fn find_aspect_in_comp_json(
    root: &Path,
    entry: &BitmapEntry,
    bare_aspect: &str,
) -> Option<(Option<String>, Value)> {
    if entry.root_dir.is_empty() {
        return None;
    }
    let comp_json = root.join(&entry.root_dir).join("component.json");
    let bytes = fs::read(comp_json).ok()?;
    let parsed = serde_json::from_slice::<Value>(&bytes).ok()?;
    let ext_obj = parsed["extensions"].as_object()?;
    extract_aspect_from_map(ext_obj, bare_aspect)
}

fn extract_aspect_from_map(
    map: &serde_json::Map<String, Value>,
    bare_aspect: &str,
) -> Option<(Option<String>, Value)> {
    let found_key = find_matching_aspect_key(map, bare_aspect)?;
    let val = map.get(&found_key)?;
    if val.as_str() == Some("-") {
        return None;
    }
    let ver = found_key.split_once('@').map(|(_, ver_str)| ver_str.to_owned());
    Some((ver, val.clone()))
}

fn find_aspect_in_scope_version(
    root: &Path,
    entry: &BitmapEntry,
    bare_aspect: &str,
) -> Option<(Option<String>, Value)> {
    let scope = bit_install::policy::scope::Scope::find(root)?;
    let ver_obj = scope
        .version(&entry.id.to_string_without_version(), entry.id.version.as_deref())
        .ok()??;
    for ext in ver_obj["extensions"].as_array()? {
        if extension_bare_id(ext).as_deref() == Some(bare_aspect) {
            let ver = ext["extensionId"]["version"].as_str().map(str::to_owned);
            let cfg = ext
                .get("config")
                .cloned()
                .unwrap_or_else(|| json!({}));
            return Some((ver, cfg));
        }
    }
    None
}

fn extension_bare_id(ext: &Value) -> Option<String> {
    if let Some(name) = ext["name"].as_str() {
        return Some(name.to_owned());
    }
    let scope_str = ext["extensionId"]["scope"].as_str()?;
    let name_str = ext["extensionId"]["name"].as_str()?;
    Some(format!("{scope_str}/{name_str}"))
}

pub(in crate::commands) fn update_in_comp_json(
    path: PathBuf,
    bare_aspect: &str,
    target_aspect_id: &str,
    cfg_val: &Value,
) -> Result<CompJsonEdit, Failure> {
    let content = fs::read_to_string(&path)?;
    let mut parsed: Value =
        serde_json::from_str(&content).map_err(|err| Failure::Declined(err.to_string()))?;
    let ext_obj = parsed["extensions"]
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json extensions missing".into()))?;
    if let Some(old_key) = find_matching_aspect_key(ext_obj, bare_aspect) {
        ext_obj.remove(&old_key);
    }
    ext_obj.insert(target_aspect_id.to_owned(), cfg_val.clone());
    let bytes = serialize_json_preserving_newline(&content, &parsed)?;
    Ok(CompJsonEdit { path, bytes })
}

pub(in crate::commands) fn update_in_bitmap_row(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    bare_aspect: &str,
    target_aspect_id: &str,
    cfg_val: &Value,
) -> Result<(), Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg = row_obj
        .entry("config")
        .or_insert_with(|| json!({}));
    let cfg_obj =
        cfg.as_object_mut().ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    if let Some(old_key) = find_matching_aspect_key(cfg_obj, bare_aspect) {
        cfg_obj.remove(&old_key);
    }
    cfg_obj.insert(target_aspect_id.to_owned(), cfg_val.clone());
    Ok(())
}
