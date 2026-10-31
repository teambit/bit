//! Native `bit internalize [component-pattern]` (`scopes/component/internalize/internalize-cmd.ts`).

pub(in crate::commands) use super::lint_cmd::consume_trailing_internalize;

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::{
        find_bitmap_row_mut, find_bitmap_row_ref, is_supported_pattern, workspace_default_scope,
        write_bitmap_if_changed,
    },
    color::Chalk,
    lint_cmd::{
        has_variants_internalize_config, is_comp_json_entry_internal, is_scope_entry_internal,
    },
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
    let Some(root) = workspace::root(&cwd) else {
        return handle_outside_workspace(&cwd, args, &options);
    };
    if !options.list && options.pattern.is_none() {
        return super::lint_cmd::emit_pattern_error(
            &root,
            args,
            "internalize",
            options.json,
            MISSING_PATTERN_ERR.into(),
        );
    }
    let chalk = Chalk::detect(args);
    match prepare(&root, &options, chalk) {
        Ok(prepared) if options.json => prepared.commit_json(&root, args),
        Ok(prepared) => workspace_command::execute_then(&root, args, "internalize", |_output| {
            prepared.commit_text(chalk)
        }),
        Err(Failure::User(message)) => {
            super::lint_cmd::emit_pattern_error(&root, args, "internalize", options.json, message)
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("internalize: {reason}"))),
    }
}

fn handle_outside_workspace(
    cwd: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI internalize outside workspace delegated".into()));
    }
    let msg = if !options.list && options.pattern.is_none() {
        MISSING_PATTERN_ERR
    } else if options.list {
        "Cannot read properties of undefined (reading 'listIds')"
    } else {
        "Cannot read properties of undefined (reading 'idsByPattern')"
    };
    workspace_command::execute_failure_scope(
        cwd,
        args,
        "internalize",
        options.json,
        "",
        io::Error::other(msg),
    )
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options { pattern: None, revert: false, list: false, json: false };
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_internalize(iter, &mut options.pattern)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-r" | "--revert" | "--revert=true" => options.revert = true,
            "--revert=false" => options.revert = false,
            "-l" | "--list" | "--list=true" => options.list = true,
            "--list=false" => options.list = false,
            "-j" | "--json" | "--json=true" => options.json = true,
            "--json=false" => options.json = false,
            val if !val.starts_with('-') && options.pattern.is_none() => {
                options.pattern = Some(val.to_owned());
            }
            val => apply_short_internalize_flags(val, &mut options)?,
        }
    }
    if !options.list
        && let Some(pat) = &options.pattern
        && !is_supported_pattern(pat)
    {
        return None;
    }
    Some(options)
}

fn apply_short_internalize_flags(arg: &str, options: &mut Options) -> Option<()> {
    let flags = arg.strip_prefix('-')?;
    if flags.is_empty() || flags.starts_with('-') {
        return None;
    }
    for ch in flags.chars() {
        match ch {
            'r' => options.revert = true,
            'l' => options.list = true,
            'j' => options.json = true,
            _ => return None,
        }
    }
    Some(())
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

fn is_entry_internal(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
) -> Result<bool, Failure> {
    let row = find_bitmap_row_ref(bitmap_val, entry)?;
    if let Some((_, cfg)) = row
        .get("config")
        .and_then(|cfg| super::update_cmd::aspect_entry(cfg, INTERNALIZE_ASPECT_ID))
    {
        if cfg.is_null() || cfg.as_str() == Some("-") {
            return Ok(false);
        }
        return Ok(cfg["internal"].as_bool().unwrap_or(false));
    }
    if let Some(internal) = is_comp_json_entry_internal(root, entry, INTERNALIZE_ASPECT_ID)? {
        return Ok(internal);
    }
    is_scope_entry_internal(root, entry, INTERNALIZE_ASPECT_ID)
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
        .and_then(|cfg| super::update_cmd::aspect_entry(cfg, INTERNALIZE_ASPECT_ID))
        .map(|(_, val)| val)
        == Some(target_cfg)
    {
        return Ok(false);
    }
    let row_obj =
        row.as_object_mut().ok_or_else(|| Failure::Declined("bitmap row object".into()))?;
    let cfg_val = row_obj
        .entry("config")
        .or_insert_with(|| json!({}));
    let key = super::update_cmd::aspect_entry(cfg_val, INTERNALIZE_ASPECT_ID)
        .map_or_else(|| INTERNALIZE_ASPECT_ID.to_owned(), |(aspect_key, _)| aspect_key.to_owned());
    let cfg_obj =
        cfg_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap config object".into()))?;
    cfg_obj.insert(key, target_cfg.clone());
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
