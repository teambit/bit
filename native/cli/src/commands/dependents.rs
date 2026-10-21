//! Native `bit dependents <component-name>` (`scopes/dependencies/dependencies/dependents-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::{find_bitmap_row_ref, workspace_default_scope},
    scope_set::selection,
    workspace_command,
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
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("dependents requires a workspace".into()));
    };
    if options.json || env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI/json dependents delegated".into()));
    }
    if let Ok(Some(err_msg)) = check_new_component(&root, &options.id) {
        return workspace_command::execute_then(&root, args, "dependents", |_output| {
            Err(io::Error::other(err_msg))
        });
    }
    Ok(Outcome::Declined("dependents graph query delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut id = None;
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-j" | "--json" => json = true,
            val if !val.starts_with('-') && id.is_none() => id = Some(val.to_owned()),
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
    bitmap.entries
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
}

pub(super) fn is_unscoped_bitmap_row(row: &Value) -> bool {
    row["scope"].as_str().is_none_or(str::is_empty)
}
