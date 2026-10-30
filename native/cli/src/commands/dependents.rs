//! Native `bit dependents <component-name>` (`scopes/dependencies/dependencies/dependents-cmd.ts`).

pub(super) use render::render_honeywell_table;

mod query;
mod render;
#[cfg(test)]
mod tests;

use self::query::run_dependents_query;
use super::{
    Command,
    aspect::{find_bitmap_row_ref, workspace_default_scope},
    color::Chalk,
    inventory,
    scope_set::{Failure, selection},
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::Value;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "dependents", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub id: String,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("dependents arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native dependents grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI dependents delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "dependents",
            options.json,
            "",
            io::Error::other(super::log::OUTSIDE_WORKSPACE_ERR),
        );
    };
    if let Ok(Some(err_msg)) = check_new_component(&root, &options.id) {
        return emit_dependents_err(&root, args, options.json, err_msg);
    }
    finish_dependents(&root, args, &options, Chalk::detect(args))
}

fn finish_dependents(
    root: &Path,
    args: &[OsString],
    options: &Options,
    chalk: Chalk,
) -> io::Result<Outcome> {
    match run_dependents_query(root, options, chalk) {
        Ok(data) if options.json => {
            workspace_command::execute_json(root, args, "dependents", move |_| {
                Ok(Report { data, code: 0, details: None })
            })
        }
        Ok(data) => workspace_command::execute_then(root, args, "dependents", move |_| {
            Ok(Report { data, code: 0, details: None })
        }),
        Err(Failure::User(message)) => emit_dependents_err(root, args, options.json, message),
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("dependents: {reason}"))),
    }
}

fn emit_dependents_err(
    root: &Path,
    args: &[OsString],
    json_flag: bool,
    err_msg: String,
) -> io::Result<Outcome> {
    if json_flag {
        return workspace_command::execute_json(root, args, "dependents", move |_| {
            Err(io::Error::other(err_msg))
        });
    }
    workspace_command::execute_then(root, args, "dependents", move |_| {
        Err(io::Error::other(err_msg))
    })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut id = None;
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            val if !val.starts_with('-') && !val.is_empty() && id.is_none() => {
                id = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { id: id?, json })
}

fn check_new_component(root: &Path, raw_id: &str) -> Result<Option<String>, String> {
    let workspace_bytes = fs::read(root.join("workspace.jsonc")).map_err(|err| err.to_string())?;
    let bitmap_bytes = fs::read(root.join(".bitmap")).map_err(|err| err.to_string())?;
    let workspace_val =
        bit_object_import::parse_jsonc(&workspace_bytes).map_err(|err| err.to_string())?;
    let bitmap_val = bit_object_import::parse_jsonc(&bitmap_bytes).map_err(|err| err.to_string())?;
    let default_scope = workspace_default_scope(&workspace_val).map_err(|err| format!("{err:?}"))?;
    let bitmap = Bitmap::load(root, Some(&default_scope)).map_err(|err| err.to_string())?;
    let Some(entry) = find_existing_bitmap_entry(&bitmap, raw_id) else {
        return Ok(None);
    };
    let row = find_bitmap_row_ref(&bitmap_val, entry).map_err(|err| format!("{err:?}"))?;
    if is_unscoped_bitmap_row(row) {
        return Ok(Some(format!(
            "{raw_id} is a new component, there is no data about it in the scope",
        )));
    }
    Ok(None)
}

pub(super) fn find_existing_bitmap_entry<'a>(
    bitmap: &'a Bitmap,
    raw_id: &str,
) -> Option<&'a BitmapEntry> {
    let has_version = raw_id.contains('@');
    let without_version = raw_id
        .split('@')
        .next()
        .unwrap_or(raw_id);
    if let Some(entry) = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && if has_version {
                    selection::entry_full_id(entry) == raw_id
                } else {
                    entry.id.to_string_without_version() == without_version
                }
        })
    {
        return Some(entry);
    }
    find_fallback_bitmap_entry(bitmap, raw_id, without_version, has_version)
}

fn find_fallback_bitmap_entry<'a>(
    bitmap: &'a Bitmap,
    raw_id: &str,
    without_version: &str,
    has_version: bool,
) -> Option<&'a BitmapEntry> {
    if let Some(entry) = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && if has_version {
                    let ver = entry.id.version.as_deref().unwrap_or_default();
                    !ver.is_empty() && format!("{}@{ver}", entry.id.name) == raw_id
                } else {
                    entry.id.name == without_version
                }
        })
    {
        return Some(entry);
    }
    (!has_version).then(|| find_bitmap_entry_by_dir(bitmap, without_version)).flatten()
}

fn find_bitmap_entry_by_dir<'a>(bitmap: &'a Bitmap, raw_dir: &str) -> Option<&'a BitmapEntry> {
    let normalized = inventory::normalize(raw_dir);
    let dir = normalized.strip_prefix("./").unwrap_or(&normalized);
    (!dir.is_empty())
        .then(|| {
            bitmap.entries
                .iter()
                .find(|entry| {
                    entry.owns_its_dir() && !entry.root_dir.is_empty() && entry.root_dir == dir
                })
        })
        .flatten()
}

pub(super) fn is_unscoped_bitmap_row(row: &Value) -> bool {
    row["scope"].as_str().is_none_or(str::is_empty)
}
