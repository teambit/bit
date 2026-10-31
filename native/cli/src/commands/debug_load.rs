//! Native `bit debug-load <component-id>` (`scopes/workspace/workspace/debug-load.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command, aspect::workspace_default_scope, dependents::find_existing_bitmap_entry, inventory,
    workspace_command,
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "debug-load", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub id: String,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("debug-load arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native debug-load grammar".into()));
    };
    if ci_enabled() {
        return Ok(Outcome::Declined("CI debug-load delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        let err = io::Error::other(
            "workspace not found. to initiate a new workspace, please use `bit init`",
        );
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "debug-load",
            options.json,
            "",
            err,
        );
    };
    if let Ok(Some(err_msg)) = check_missing_workspace_component(&root, &options.id) {
        return emit_debug_load_error(&root, args, options.json, err_msg);
    }
    Ok(Outcome::Declined("debug-load trace inspection delegated".into()))
}

fn emit_debug_load_error(
    root: &Path,
    args: &[OsString],
    json_flag: bool,
    err_msg: String,
) -> io::Result<Outcome> {
    if json_flag {
        return workspace_command::execute_json(root, args, "debug-load", |_| {
            Err(io::Error::other(err_msg))
        });
    }
    workspace_command::execute_then(root, args, "debug-load", |_| Err(io::Error::other(err_msg)))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut id = None;
    let mut json = false;
    let mut idx = 0;
    while idx < args.len() {
        if args[idx] == "--" {
            super::internalize::consume_trailing_internalize(
                args[idx + 1..].iter().copied(),
                &mut id,
            )?;
            break;
        }
        if consume_aspect_plus_deps(args, &mut idx)? {
            idx += 1;
            continue;
        }
        match args[idx] {
            arg if is_ignored_debug_load_flag(arg) => {}
            "-j" | "-j=true" | "-rj" | "-jr" | "--json" | "--json=true" => json = true,
            "-j=false" | "--json=false" => json = false,
            val if !val.trim().starts_with('-') && !val.trim().is_empty() && id.is_none() => {
                id = Some(val.trim().to_owned());
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(Options { id: id?, json })
}

fn is_ignored_debug_load_flag(arg: &str) -> bool {
    matches!(
        arg,
        "--no-color"
            | "--no-color=true"
            | "--no-color=false"
            | "--all-aspects"
            | "--all-aspects=true"
            | "--all-aspects=false"
            | "--skip-deps"
            | "--skip-deps=true"
            | "--skip-deps=false"
            | "-r"
            | "-r=true"
            | "-r=false"
            | "--re-load"
            | "--re-load=true"
            | "--re-load=false",
    )
}

fn ci_enabled() -> bool {
    env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "0" && !trimmed.eq_ignore_ascii_case("false")
        })
}

fn consume_aspect_plus_deps(args: &[&str], idx: &mut usize) -> Option<bool> {
    match args[*idx] {
        "-p" | "--aspect-plus-deps" => {
            *idx += 1;
            let val = args.get(*idx)?.trim();
            (!val.is_empty() && !val.starts_with('-')).then_some(true)
        }
        arg if let Some(val) = arg
            .strip_prefix("--aspect-plus-deps=")
            .or_else(|| arg.strip_prefix("-p=")) =>
        {
            let val = val.trim();
            (!val.is_empty() && !val.starts_with('-')).then_some(true)
        }
        _ => Some(false),
    }
}

pub(super) fn check_missing_workspace_component(
    root: &Path,
    raw_id: &str,
) -> Result<Option<String>, String> {
    let raw_id = raw_id.trim();
    if raw_id.starts_with('@') || raw_id.starts_with("teambit.") {
        return Ok(None);
    }
    let workspace_bytes = fs::read(root.join("workspace.jsonc")).map_err(|err| err.to_string())?;
    let workspace_val =
        bit_object_import::parse_jsonc(&workspace_bytes).map_err(|err| err.to_string())?;
    let default_scope = workspace_default_scope(&workspace_val).map_err(|err| format!("{err:?}"))?;
    let bitmap = Bitmap::load(root, Some(&default_scope)).map_err(|err| err.to_string())?;

    let normalized = inventory::normalize(raw_id);
    let directory = normalized
        .strip_prefix("./")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    if bitmap.entries
        .iter()
        .any(|entry| {
            let root_dir = entry.root_dir.trim().trim_end_matches('/');
            !root_dir.is_empty() && root_dir == directory && entry.owns_its_dir()
        })
        || find_existing_bitmap_entry(&bitmap, raw_id).is_some()
    {
        return Ok(None);
    }
    Ok(missing_component_error(root, raw_id))
}

fn missing_component_error(root: &Path, raw_id: &str) -> Option<String> {
    let without_ver = raw_id
        .split('@')
        .next()
        .unwrap_or(raw_id)
        .trim();
    if let Some((scope, name)) = without_ver.split_once('/') {
        let (scope, name) = (scope.trim(), name.trim());
        return (!scope.is_empty() && !name.is_empty()).then(|| {
            format!(
                r#"unable to find "{raw_id}" in the workspace. debug-load works on workspace components only"#,
            )
        });
    }
    if exists_in_scope_index(root, without_ver) {
        return Some(format!(
            r#"unable to find "{raw_id}" in the workspace. debug-load works on workspace components only"#,
        ));
    }
    Some(format!(
        r#"error: component ID "{raw_id}" is invalid, please use the following format: [scope]/<name>"#,
    ))
}

fn exists_in_scope_index(root: &Path, name: &str) -> bool {
    crate::commands::scope_set::selection::exists_in_scope_index(root, name)
}
