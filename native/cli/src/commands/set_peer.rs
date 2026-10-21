//! Native `bit set-peer <component-id> <range>` and `bit unset-peer <component-id>` (`scopes/dependencies/dependencies/dependencies-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::{
        deep_merge, find_bitmap_row_mut, find_bitmap_row_ref, is_supported_pattern,
        workspace_default_scope, write_bitmap_if_changed,
    },
    color::Chalk,
    debug_cat::lookup::{load_cat_component, resolve_component_entry},
    lane::scope_root::ScopeRoot,
    scope_set::{Failure, selection},
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{
    dependencies::cache::invalidation::deps_dir,
    workspace::{Bitmap, BitmapEntry},
};
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

pub const SET_PEER: Command = Command { name: "set-peer", aliases: &[], run: run_set };
pub const UNSET_PEER: Command = Command { name: "unset-peer", aliases: &[], run: run_unset };

pub(in crate::commands) const DEP_RESOLVER_ID: &str = "teambit.dependencies/dependency-resolver";

#[derive(Debug, Clone, PartialEq, Eq)]
enum PeerAction {
    Set { component_id: String, range: String },
    Unset { component_id: String },
}

struct Prepared {
    root: PathBuf,
    reason: String,
    summary: &'static str,
    bitmap_before: Vec<u8>,
    bitmap_val: Value,
    bitmap_changed: bool,
}

fn run_set(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("set-peer arguments are not UTF-8".into()));
    };
    let Some(action) = parse_set_args(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native set-peer grammar".into()));
    };
    run_action(args, "set-peer", &action)
}

fn run_unset(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("unset-peer arguments are not UTF-8".into()));
    };
    let Some(action) = parse_unset_args(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native unset-peer grammar".into()));
    };
    run_action(args, "unset-peer", &action)
}

fn run_action(args: &[OsString], label: &'static str, action: &PeerAction) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined(format!("{label} requires a workspace")));
    };
    let chalk = Chalk::detect(args);
    match prepare(&root, action, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(&root, args, label, |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined(format!("CI {label} error stack")));
            }
            workspace_command::execute_then(&root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("{label}: {reason}"))),
    }
}

fn parse_set_args(args: &[&str]) -> Option<PeerAction> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    let [component_id, range] = filtered.as_slice() else {
        return None;
    };
    if !is_single_component_arg(component_id) || !is_safe_range_arg(range) {
        return None;
    }
    Some(PeerAction::Set { component_id: (*component_id).to_owned(), range: (*range).to_owned() })
}

fn parse_unset_args(args: &[&str]) -> Option<PeerAction> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    let [component_id] = filtered.as_slice() else {
        return None;
    };
    if !is_single_component_arg(component_id) {
        return None;
    }
    Some(PeerAction::Unset { component_id: (*component_id).to_owned() })
}

fn is_single_component_arg(id: &str) -> bool {
    is_supported_pattern(id) && !id.contains(['*', ',', '!'])
}

fn is_safe_range_arg(range: &str) -> bool {
    !range.is_empty()
        && !range.starts_with('-')
        && range.trim() == range
        && !range.starts_with("0x")
        && !range.starts_with("0X")
}

fn prepare(root: &Path, action: &PeerAction, chalk: Chalk) -> Result<Prepared, Failure> {
    let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
    let mut bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
    let bitmap = Bitmap::load(root, Some(&workspace_default_scope(&workspace_val)?))?;
    let component_id = match action {
        PeerAction::Set { component_id, .. } | PeerAction::Unset { component_id } => component_id,
    };
    let matched = selection::resolve_pattern_entries(root, &bitmap, component_id, chalk)?;
    let [entry] = matched.as_slice() else {
        return Err(Failure::Declined("multiple entries on set-peer/unset-peer".into()));
    };
    let (bitmap_changed, reason, summary) =
        apply_peer_action(root, &mut bitmap_val, entry, action)?;
    Ok(Prepared {
        root: root.to_path_buf(),
        reason,
        summary,
        bitmap_before,
        bitmap_val,
        bitmap_changed,
    })
}

fn apply_peer_action(
    root: &Path,
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    action: &PeerAction,
) -> Result<(bool, String, &'static str), Failure> {
    match action {
        PeerAction::Set { component_id, range } => {
            let cfg = json!({ "peer": true, "defaultPeerRange": range });
            let changed = apply_dep_resolver_config(root, bitmap_val, entry, cfg, true, true)?;
            Ok((
                changed,
                format!("set-peer ({component_id})"),
                "successfully marked the component as a peer component",
            ))
        }
        PeerAction::Unset { component_id } => {
            let mut cfg =
                load_dep_resolver_config(root, bitmap_val, entry)?.unwrap_or_else(|| json!({}));
            if let Some(obj) = cfg.as_object_mut() {
                obj.remove("peer");
                obj.remove("defaultPeerRange");
            }
            let changed = set_bitmap_dep_resolver_config(bitmap_val, entry, cfg)?;
            Ok((
                changed,
                format!("unset-peer ({component_id})"),
                "successfully marked the component as not a peer component",
            ))
        }
    }
}

pub(in crate::commands) fn apply_dep_resolver_config(
    root: &Path,
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    config: Value,
    merge_existing: bool,
    merge_previous: bool,
) -> Result<bool, Failure> {
    if !entry.root_dir.is_empty()
        && root
            .join(&entry.root_dir)
            .join("component.json")
            .exists()
    {
        return Err(Failure::Declined("component.json exists".into()));
    }
    let effective = if merge_previous {
        match load_dep_resolver_config(root, bitmap_val, entry)? {
            Some(mut prev) => {
                deep_merge(&mut prev, &config);
                prev
            }
            None => config,
        }
    } else {
        config
    };
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let current = row
        .get("config")
        .and_then(|cfg| cfg.get(DEP_RESOLVER_ID));
    if current == Some(&effective) {
        return Ok(false);
    }
    let new_cfg = match (merge_existing, current) {
        (true, Some(existing)) if existing.is_object() => {
            let mut merged = existing.clone();
            deep_merge(&mut merged, &effective);
            merged
        }
        _ => effective,
    };
    insert_dep_resolver_config(row, new_cfg)?;
    Ok(true)
}

fn set_bitmap_dep_resolver_config(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    config: Value,
) -> Result<bool, Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let current = row
        .get("config")
        .and_then(|cfg| cfg.get(DEP_RESOLVER_ID));
    if current == Some(&config) {
        return Ok(false);
    }
    insert_dep_resolver_config(row, config)?;
    Ok(true)
}

fn insert_dep_resolver_config(row: &mut Value, config: Value) -> Result<(), Failure> {
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg_val = row_obj
        .entry("config")
        .or_insert_with(|| json!({}));
    let cfg_obj =
        cfg_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    cfg_obj.insert(DEP_RESOLVER_ID.into(), config);
    Ok(())
}

pub(in crate::commands) fn load_dep_resolver_config(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
) -> Result<Option<Value>, Failure> {
    if root.join("workspace-config-merge.json").exists()
        || workspace::scope_path(root).join("unmerged.json").exists()
    {
        return Err(Failure::Declined("merge state active".into()));
    }
    let row = find_bitmap_row_ref(bitmap_val, entry)?;
    if let Some(val) = row
        .get("config")
        .and_then(|cfg| cfg.get(DEP_RESOLVER_ID))
    {
        return clean_dep_resolver_value(val);
    }
    let mut comp_json_propagate = true;
    if !entry.root_dir.is_empty() {
        let comp_json_path = root.join(&entry.root_dir).join("component.json");
        if comp_json_path.is_file() {
            let parsed: Value = serde_json::from_slice(&fs::read(&comp_json_path)?)
                .map_err(|err| Failure::Declined(err.to_string()))?;
            comp_json_propagate = parsed["propagate"].as_bool().unwrap_or(false);
            if let Some(val) = parsed["extensions"].get(DEP_RESOLVER_ID) {
                return clean_dep_resolver_value(val);
            }
        }
    }
    load_scope_dep_resolver_config(root, entry, comp_json_propagate)
}

fn clean_dep_resolver_value(val: &Value) -> Result<Option<Value>, Failure> {
    if val.as_str() == Some("-") {
        return Ok(None);
    }
    let Some(obj) = val.as_object() else {
        return Err(Failure::Declined("non-object dependency-resolver config".into()));
    };
    let mut cleaned = obj.clone();
    cleaned.remove("__specific");
    Ok((!cleaned.is_empty()).then_some(Value::Object(cleaned)))
}

fn load_scope_dep_resolver_config(
    root: &Path,
    entry: &BitmapEntry,
    comp_json_propagate: bool,
) -> Result<Option<Value>, Failure> {
    let scope_dir = workspace::scope_path(root);
    let bare_id = entry.id.to_string_without_version();
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        if resolve_component_entry(&scope_dir, &bare_id).is_some() {
            return Err(Failure::Declined("unversioned bitmap entry exists in scope".into()));
        }
        return Ok(None);
    };
    let scope_root = ScopeRoot { path: root.to_path_buf(), bare: false };
    let Some(ver_val) = load_cat_component(&scope_root, &scope_dir, &format!("{bare_id}@{ver}"))
    else {
        return Err(Failure::Declined("version object missing in local scope".into()));
    };
    extract_scope_dep_resolver_config(&ver_val, comp_json_propagate)
}

fn extract_scope_dep_resolver_config(
    ver_val: &Value,
    comp_json_propagate: bool,
) -> Result<Option<Value>, Failure> {
    let Some(ext) = ver_val["extensions"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|ext| ext["name"].as_str() == Some(DEP_RESOLVER_ID))
        })
    else {
        return Ok(None);
    };
    if ext["config"].as_str() == Some("-") {
        return Ok(None);
    }
    let Some(cfg_obj) = ext["config"].as_object() else {
        return Ok(None);
    };
    let is_specific = cfg_obj
        .get("__specific")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !is_specific && !comp_json_propagate {
        return Ok(None);
    }
    let mut cleaned = cfg_obj.clone();
    cleaned.remove("__specific");
    normalize_scope_dep_resolver_policy(&mut cleaned);
    Ok((!cleaned.is_empty()).then_some(Value::Object(cleaned)))
}

fn normalize_scope_dep_resolver_policy(cleaned: &mut Map<String, Value>) {
    let Some(policy) = cleaned.get_mut("policy").and_then(Value::as_object_mut) else {
        return;
    };
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(arr) = policy.get(field).and_then(Value::as_array) else {
            continue;
        };
        let forced = collect_forced_policy_entries(arr);
        if forced.is_empty() {
            policy.remove(field);
        } else {
            policy.insert(field.into(), Value::Object(forced));
        }
    }
}

fn collect_forced_policy_entries(arr: &[Value]) -> Map<String, Value> {
    arr.iter()
        .filter(|item| item["force"].as_bool() == Some(true))
        .filter_map(|item| Some((item["name"].as_str()?.to_owned(), item.get("version")?.clone())))
        .collect()
}

impl Prepared {
    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        write_bitmap_if_changed(
            &self.root,
            &self.bitmap_before,
            &self.bitmap_val,
            self.bitmap_changed,
            &self.reason,
        )?;
        let _ = fs::remove_dir_all(deps_dir(&self.root));
        let formatter = Formatter::new(chalk);
        Ok(Report { data: formatter.success_summary(self.summary), code: 0, details: None })
    }
}
