//! Native `bit internalize [component-pattern]` (`scopes/component/internalize/internalize-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::{
        find_bitmap_row_mut, find_bitmap_row_ref, is_supported_pattern, workspace_default_scope,
        write_bitmap_if_changed,
    },
    color::Chalk,
    debug_cat::lookup::{load_cat_component, resolve_component_entry},
    lane::scope_root::ScopeRoot,
    scope_set::{Failure, selection},
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "internalize", aliases: &[], run };

const INTERNALIZE_ASPECT_ID: &str = "teambit.component/internalize";
const MISSING_PATTERN_ERR: &str =
    "please specify a component-pattern, or use --list to show the internal components";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub revert: bool,
    pub list: bool,
    pub json: bool,
}

enum Prepared {
    List {
        ids: Vec<String>,
    },
    Mutate {
        root: PathBuf,
        changed: Vec<String>,
        revert: bool,
        reason: String,
        bitmap_before: Vec<u8>,
        bitmap_val: Value,
    },
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("internalize arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native internalize grammar".into()));
    };
    let cwd = env::current_dir()?;
    if !options.list && options.pattern.is_none() {
        return handle_missing_pattern(&cwd, args, options.json);
    }
    let Some(root) = workspace::root(&cwd) else {
        return Ok(Outcome::Declined("internalize requires a workspace".into()));
    };
    let chalk = Chalk::detect(args);
    match prepare(&root, &options, chalk) {
        Ok(prepared) if options.json => prepared.commit_json(&root, args),
        Ok(prepared) => workspace_command::execute_then(&root, args, "internalize", |_output| {
            prepared.commit_text(chalk)
        }),
        Err(Failure::User(message)) => handle_user_error(&root, args, options.json, message),
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("internalize: {reason}"))),
    }
}

fn handle_missing_pattern(cwd: &Path, args: &[OsString], json_flag: bool) -> io::Result<Outcome> {
    if json_flag || env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("missing pattern error delegated".into()));
    }
    if let Some(root) = workspace::root(cwd) {
        workspace_command::execute_then(&root, args, "internalize", |_output| {
            Err(io::Error::other(MISSING_PATTERN_ERR))
        })
    } else {
        workspace_command::execute_failure_scope(
            cwd,
            args,
            "internalize",
            false,
            "",
            io::Error::other(MISSING_PATTERN_ERR),
        )
    }
}

fn handle_user_error(
    root: &Path,
    args: &[OsString],
    json_flag: bool,
    message: String,
) -> io::Result<Outcome> {
    if json_flag || env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI/json internalize error delegated".into()));
    }
    workspace_command::execute_then(root, args, "internalize", |_output| {
        Err(io::Error::other(message))
    })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut revert = false;
    let mut list = false;
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-r" | "--revert" => revert = true,
            "-l" | "--list" => list = true,
            "-j" | "--json" => json = true,
            val if !val.starts_with('-') && pattern.is_none() => pattern = Some(val.to_owned()),
            _ => return None,
        }
    }
    if !list
        && let Some(pat) = &pattern
        && !is_supported_pattern(pat)
    {
        return None;
    }
    Some(Options { pattern, revert, list, json })
}

fn prepare(root: &Path, options: &Options, chalk: Chalk) -> Result<Prepared, Failure> {
    let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
    let bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
    let bitmap = Bitmap::load(root, Some(&workspace_default_scope(&workspace_val)?))?;
    if options.list {
        return prepare_list(root, &workspace_val, &bitmap, &bitmap_val);
    }
    let pattern =
        options.pattern.as_deref().ok_or_else(|| Failure::User(MISSING_PATTERN_ERR.into()))?;
    prepare_mutate(root, &bitmap, pattern, options.revert, bitmap_before, bitmap_val, chalk)
}

fn prepare_list(
    root: &Path,
    workspace_val: &Value,
    bitmap: &Bitmap,
    bitmap_val: &Value,
) -> Result<Prepared, Failure> {
    if root.join("workspace-config-merge.json").exists()
        || workspace::scope_path(root).join("unmerged.json").exists()
    {
        return Err(Failure::Declined("merge state active".into()));
    }
    if has_variants_internalize_config(workspace_val) {
        return Err(Failure::Declined("variants configure internalize".into()));
    }
    let mut ids = Vec::new();
    for entry in bitmap.entries.iter().filter(|entry| entry.owns_its_dir()) {
        if is_entry_internal(root, bitmap_val, entry)? {
            ids.push(selection::entry_full_id(entry));
        }
    }
    Ok(Prepared::List { ids })
}

fn has_variants_internalize_config(workspace_val: &Value) -> bool {
    let Some(rows) = workspace_val.as_object() else {
        return false;
    };
    rows.iter()
        .find(|(key, _)| key.split('@').next() == Some("teambit.workspace/variants"))
        .is_some_and(|(_, val)| val.to_string().contains(INTERNALIZE_ASPECT_ID))
}

fn is_entry_internal(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
) -> Result<bool, Failure> {
    let row = find_bitmap_row_ref(bitmap_val, entry)?;
    if let Some(cfg) = row
        .get("config")
        .and_then(|cfg| cfg.get(INTERNALIZE_ASPECT_ID))
    {
        if cfg.as_str() == Some("-") {
            return Ok(false);
        }
        return Ok(cfg["internal"].as_bool().unwrap_or(false));
    }
    if let Some(internal) = is_comp_json_entry_internal(root, entry)? {
        return Ok(internal);
    }
    is_scope_entry_internal(root, entry)
}

fn is_comp_json_entry_internal(root: &Path, entry: &BitmapEntry) -> Result<Option<bool>, Failure> {
    if entry.root_dir.is_empty() {
        return Ok(None);
    }
    let comp_json_path = root.join(&entry.root_dir).join("component.json");
    if !comp_json_path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&comp_json_path)?;
    let parsed: Value =
        serde_json::from_slice(&bytes).map_err(|err| Failure::Declined(err.to_string()))?;
    let Some(cfg) = parsed["extensions"].get(INTERNALIZE_ASPECT_ID) else {
        return Ok(None);
    };
    if cfg.as_str() == Some("-") {
        return Ok(Some(false));
    }
    Ok(Some(cfg["internal"].as_bool().unwrap_or(false)))
}

fn is_scope_entry_internal(root: &Path, entry: &BitmapEntry) -> Result<bool, Failure> {
    let scope_dir = workspace::scope_path(root);
    let bare_id = entry.id.to_string_without_version();
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        if resolve_component_entry(&scope_dir, &bare_id).is_some() {
            return Err(Failure::Declined("unversioned bitmap entry exists in scope".into()));
        }
        return Ok(false);
    };
    let scope_root = ScopeRoot { path: root.to_path_buf(), bare: false };
    let Some(ver_val) = load_cat_component(&scope_root, &scope_dir, &format!("{bare_id}@{ver}"))
    else {
        return Err(Failure::Declined("version object missing in local scope".into()));
    };
    let ext = ver_val["extensions"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|ext| ext["name"].as_str() == Some(INTERNALIZE_ASPECT_ID))
        });
    Ok(ext.is_some_and(|item| item["config"]["internal"].as_bool().unwrap_or(false)))
}

fn prepare_mutate(
    root: &Path,
    bitmap: &Bitmap,
    pattern: &str,
    revert: bool,
    bitmap_before: Vec<u8>,
    mut bitmap_val: Value,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(root, bitmap, pattern, chalk)?;
    let target_cfg = json!({ "internal": !revert });
    let mut changed = Vec::new();
    for entry in matched {
        if apply_internalize_row(&mut bitmap_val, entry, &target_cfg)? {
            changed.push(selection::entry_full_id(entry));
        }
    }
    let action = if revert { "uninternalize" } else { "internalize" };
    let reason = match changed.as_slice() {
        [single] => format!("{action} {single}"),
        _ => format!("{action} {} components", changed.len()),
    };
    Ok(Prepared::Mutate {
        root: root.to_path_buf(),
        changed,
        revert,
        reason,
        bitmap_before,
        bitmap_val,
    })
}

fn apply_internalize_row(
    bitmap_val: &mut Value,
    entry: &bit_install::workspace::BitmapEntry,
    target_cfg: &Value,
) -> Result<bool, Failure> {
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    if row
        .get("config")
        .and_then(|cfg| cfg.get(INTERNALIZE_ASPECT_ID))
        == Some(target_cfg)
    {
        return Ok(false);
    }
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg_obj = row_obj
        .entry("config")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    cfg_obj.insert(INTERNALIZE_ASPECT_ID.into(), target_cfg.clone());
    Ok(true)
}

impl Prepared {
    fn commit_json(self, root: &Path, args: &[OsString]) -> io::Result<Outcome> {
        let history = History::start(root, args);
        let ids = match self {
            Self::List { ids } => ids,
            Self::Mutate {
                root,
                changed,
                reason,
                bitmap_before,
                bitmap_val,
                ..
            } => {
                write_bitmap_if_changed(
                    &root,
                    &bitmap_before,
                    &bitmap_val,
                    !changed.is_empty(),
                    &reason,
                )?;
                changed
            }
        };
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&ids)?.as_bytes())?;
        stdout.flush()?;
        history.end(true);
        Ok(Outcome::Exit(ExitCode::SUCCESS))
    }

    fn commit_text(self, chalk: Chalk) -> io::Result<Report> {
        let formatter = Formatter::new(chalk);
        let data = match self {
            Self::List { ids } => render_list(&formatter, &ids),
            Self::Mutate {
                root,
                changed,
                revert,
                reason,
                bitmap_before,
                bitmap_val,
            } => {
                write_bitmap_if_changed(
                    &root,
                    &bitmap_before,
                    &bitmap_val,
                    !changed.is_empty(),
                    &reason,
                )?;
                render_mutate(&formatter, &changed, revert)
            }
        };
        Ok(Report { data, code: 0, details: None })
    }
}

fn render_list(formatter: &Formatter, ids: &[String]) -> String {
    if ids.is_empty() {
        return formatter.hint("no internal components found in the workspace");
    }
    let items = ids
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>();
    formatter.section("internal components", "", &items)
}

fn render_mutate(formatter: &Formatter, changed: &[String], revert: bool) -> String {
    if changed.is_empty() {
        return formatter.hint(if revert {
            "no matching components are currently internal. no changes have been made"
        } else {
            "the matching components are already internal. no changes have been made"
        });
    }
    let verb = if revert { "uninternalized" } else { "internalized" };
    let summary = formatter.success_summary(&format!(
        "{} component(s) have been {verb} successfully",
        changed.len(),
    ));
    let items = changed
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>();
    Formatter::join(&[summary, items.join("\n")])
}
