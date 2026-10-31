//! `.bitmap` and `component.json` mutation helpers for `bit deps`.

use super::Subcommand;
use crate::{
    commands::{
        aspect::{
            deep_merge, find_bitmap_row_mut, serialize_json_preserving_newline,
            workspace_default_scope, write_bitmap_if_changed,
        },
        color::Chalk,
        lane::scope_root,
        scope_set::{Failure, selection},
        set_peer::{DEP_RESOLVER_ID, load_dep_resolver_config},
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
    workspace,
};
use bit_install::{
    dependencies::cache::invalidation::deps_dir,
    workspace::{Bitmap, BitmapEntry},
};
use serde::Serialize;
use serde_json::{Map, Value, json, ser::PrettyFormatter};
use std::{
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";

pub(in crate::commands) struct CompJsonEdit {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
}

pub(in crate::commands) struct BitmapMutation {
    pub root: PathBuf,
    pub reason: String,
    pub bitmap_before: Vec<u8>,
    pub bitmap_val: Value,
    pub bitmap_changed: bool,
    pub comp_json_edits: Vec<CompJsonEdit>,
}

impl BitmapMutation {
    pub(in crate::commands) fn load(root: &Path) -> Result<(Self, Bitmap), Failure> {
        let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
        let bitmap_before = fs::read(root.join(".bitmap"))?;
        let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
        let bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
        let default_scope = workspace_default_scope(&workspace_val)?;
        let bitmap = Bitmap::load(root, Some(&default_scope))?;
        Ok((
            Self {
                root: root.to_path_buf(),
                reason: String::new(),
                bitmap_before,
                bitmap_val,
                bitmap_changed: false,
                comp_json_edits: Vec::new(),
            },
            bitmap,
        ))
    }

    pub(in crate::commands) fn flush(&self) -> io::Result<()> {
        for edit in &self.comp_json_edits {
            fs::write(&edit.path, &edit.bytes)?;
        }
        write_bitmap_if_changed(
            &self.root,
            &self.bitmap_before,
            &self.bitmap_val,
            self.bitmap_changed,
            &self.reason,
        )?;
        let _ = fs::remove_dir_all(deps_dir(&self.root));
        Ok(())
    }
}

pub(super) struct SetSpec<'a> {
    pub pattern: &'a str,
    pub packages: &'a [(String, String)],
    pub dev: bool,
    pub optional: bool,
    pub peer: bool,
}

pub(super) struct ListActionSpec<'a> {
    pub pattern: &'a str,
    pub reason: String,
    pub summary: &'static str,
    pub config: Value,
    pub merge_existing: bool,
    pub merge_previous: bool,
}

pub(in crate::commands) fn apply_dep_resolver_config(
    mutation: &mut BitmapMutation,
    entry: &BitmapEntry,
    config: Value,
    merge_existing: bool,
    merge_previous: bool,
) -> Result<(), Failure> {
    let effective = if merge_previous {
        match load_dep_resolver_config(&mutation.root, &mutation.bitmap_val, entry)? {
            Some(mut prev) => {
                deep_merge(&mut prev, &config);
                prev
            }
            None => config,
        }
    } else {
        config
    };
    if let Some(comp_json_path) = component_json_path(&mutation.root, entry) {
        let edit = update_comp_json(&comp_json_path, effective, merge_existing)?;
        if let Some(edit) = edit {
            mutation.comp_json_edits.push(edit);
        }
        return Ok(());
    }
    if update_bitmap_row(&mut mutation.bitmap_val, entry, effective, merge_existing)? {
        mutation.bitmap_changed = true;
    }
    Ok(())
}

fn component_json_path(root: &Path, entry: &BitmapEntry) -> Option<PathBuf> {
    if entry.root_dir.is_empty() {
        return None;
    }
    let path = root.join(&entry.root_dir).join("component.json");
    path.is_file().then_some(path)
}

fn update_comp_json(
    path: &Path,
    effective: Value,
    merge_existing: bool,
) -> Result<Option<CompJsonEdit>, Failure> {
    if path
        .parent()
        .is_some_and(|dir| workspace::scope_path(dir).join("unmerged.json").exists())
    {
        return Err(Failure::Declined("merge state active".into()));
    }
    let content = fs::read_to_string(path)?;
    let mut parsed: Value = bit_object_import::parse_jsonc(content.as_bytes())?;
    let current = parsed
        .get("extensions")
        .and_then(|ext| {
            crate::commands::update_cmd::aspect_entry(ext, DEP_RESOLVER_ID).map(|(_, val)| val)
        });
    if current == Some(&effective) {
        return Ok(None);
    }
    let new_cfg = match (merge_existing, current) {
        (true, Some(existing)) if existing.is_object() => {
            let mut merged = existing.clone();
            deep_merge(&mut merged, &effective);
            merged
        }
        _ => effective,
    };
    insert_comp_json_dep_resolver(&mut parsed, new_cfg)?;
    let bytes = serialize_json_preserving_newline(&content, &parsed)?;
    Ok(Some(CompJsonEdit { path: path.to_path_buf(), bytes }))
}

fn insert_comp_json_dep_resolver(parsed: &mut Value, new_cfg: Value) -> Result<(), Failure> {
    let root_obj = parsed
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json root object".into()))?;
    let ext_val = root_obj
        .entry("extensions")
        .or_insert_with(|| json!({}));
    let key = crate::commands::update_cmd::aspect_entry(ext_val, DEP_RESOLVER_ID)
        .map_or_else(|| DEP_RESOLVER_ID.to_owned(), |(key, _)| key.to_owned());
    let ext_obj = ext_val
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("component.json extensions object".into()))?;
    ext_obj.insert(key, new_cfg);
    Ok(())
}

fn update_bitmap_row(
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
    effective: Value,
    merge_existing: bool,
) -> Result<bool, Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let current = row
        .get("config")
        .and_then(|cfg| {
            crate::commands::update_cmd::aspect_entry(cfg, DEP_RESOLVER_ID).map(|(_, val)| val)
        });
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
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg_val = row_obj
        .entry("config")
        .or_insert_with(|| json!({}));
    let key = crate::commands::update_cmd::aspect_entry(cfg_val, DEP_RESOLVER_ID)
        .map_or_else(|| DEP_RESOLVER_ID.to_owned(), |(key, _)| key.to_owned());
    let cfg_obj =
        cfg_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    cfg_obj.insert(key, new_cfg);
    Ok(true)
}

pub(super) fn prepare_set(
    mut mutation: BitmapMutation,
    bitmap: &Bitmap,
    spec: &SetSpec<'_>,
    chalk: Chalk,
) -> Result<(BitmapMutation, Vec<String>, Value), Failure> {
    let matched = selection::resolve_pattern_entries(&mutation.root, bitmap, spec.pattern, chalk)?;
    let field = set_policy_field(spec);
    let added_packages = build_added_packages(spec)?;
    let cfg = json!({ "policy": { field: &added_packages } });
    let mut changed_comps = Vec::with_capacity(matched.len());
    for entry in matched {
        apply_dep_resolver_config(&mut mutation, entry, cfg.clone(), true, true)?;
        changed_comps.push(entry.id.to_string_without_version());
    }
    mutation.reason = format!("deps-set ({})", spec.pattern);
    Ok((mutation, changed_comps, added_packages))
}

fn set_policy_field(spec: &SetSpec<'_>) -> &'static str {
    if spec.dev {
        "devDependencies"
    } else if spec.peer {
        "peerDependencies"
    } else {
        "dependencies"
    }
}

fn build_added_packages(spec: &SetSpec<'_>) -> Result<Value, Failure> {
    let mut pkg_map = Map::new();
    for (name, ver) in spec.packages {
        if name.trim().is_empty() || ver.trim().is_empty() {
            return Err(Failure::Declined("deps set package name or version is empty".into()));
        }
        let entry_val = if spec.optional {
            json!({ "optional": true, "version": ver })
        } else {
            Value::String(ver.clone())
        };
        pkg_map.insert(name.clone(), entry_val);
    }
    Ok(Value::Object(pkg_map))
}

pub(super) fn prepare_list_action(
    mut mutation: BitmapMutation,
    bitmap: &Bitmap,
    spec: ListActionSpec<'_>,
    chalk: Chalk,
) -> Result<(BitmapMutation, &'static str, Vec<String>), Failure> {
    let matched = selection::resolve_pattern_entries(&mutation.root, bitmap, spec.pattern, chalk)?;
    let mut comps = Vec::with_capacity(matched.len());
    for entry in matched {
        apply_dep_resolver_config(
            &mut mutation,
            entry,
            spec.config.clone(),
            spec.merge_existing,
            spec.merge_previous,
        )?;
        comps.push(selection::entry_full_id(entry));
    }
    mutation.reason = spec.reason;
    Ok((mutation, spec.summary, comps))
}

pub(super) fn format_json_indent_4(val: &Value) -> io::Result<String> {
    let mut buf = Vec::new();
    let mut ser =
        serde_json::Serializer::with_formatter(&mut buf, PrettyFormatter::with_indent(b"    "));
    val.serialize(&mut ser).map_err(io::Error::other)?;
    String::from_utf8(buf).map_err(io::Error::other)
}

pub(super) fn commit_set(
    formatter: &Formatter,
    mutation: &BitmapMutation,
    changed_comps: &[String],
    added_packages: &Value,
) -> io::Result<String> {
    mutation.flush()?;
    let comp_items = changed_comps
        .iter()
        .map(|comp| formatter.item(comp))
        .collect::<Vec<_>>();
    let comp_section = formatter.section("changed components", "", &comp_items);
    let pkg_section = format!(
        "{}\n{}",
        formatter.title("added packages"),
        format_json_indent_4(added_packages)?,
    );
    Ok(Formatter::join(&[
        formatter.success_summary("successfully updated dependencies"),
        comp_section,
        pkg_section,
    ]))
}

pub(super) fn commit_list_action(
    formatter: &Formatter,
    mutation: &BitmapMutation,
    summary: &str,
    comps: &[String],
) -> io::Result<String> {
    mutation.flush()?;
    let items = comps
        .iter()
        .map(|comp| formatter.item(comp))
        .collect::<Vec<_>>();
    Ok(Formatter::join(&[formatter.success_summary(summary), items.join("\n")]))
}

pub(super) fn outside_workspace_failure(subcommand: &Subcommand) -> Option<(bool, &'static str)> {
    match subcommand {
        Subcommand::Debug { .. }
        | Subcommand::Usage { .. }
        | Subcommand::Why { .. }
        | Subcommand::Diagnose { .. }
        | Subcommand::DiagnosePackage { .. } => Some((false, OUTSIDE_WORKSPACE_ERR)),
        Subcommand::Circular { json, .. } => Some((*json, OUTSIDE_WORKSPACE_ERR)),
        Subcommand::Set { .. }
        | Subcommand::Remove { .. }
        | Subcommand::Unset { .. }
        | Subcommand::Reset { .. }
        | Subcommand::Eject { .. } => {
            Some((false, "Cannot read properties of undefined (reading 'idsByPattern')"))
        }
        Subcommand::Blame { .. } | Subcommand::Get { .. } => {
            Some((false, "Cannot read properties of undefined (reading 'resolveComponentId')"))
        }
        Subcommand::Write { .. } => {
            Some((false, "Cannot read properties of undefined (reading 'writeDependencies')"))
        }
        Subcommand::Unrecognized(_) => None,
    }
}

pub(super) fn run_unrecognized(args: &[OsString], sub: &str, chalk: Chalk) -> io::Result<Outcome> {
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "dependencies", please run "bit dependencies --help" to list the subcommands"#,
    ));
    let report = Report { data, code: 0, details: None };
    match scope_root::discover().ok().flatten() {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "deps", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "deps", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}
