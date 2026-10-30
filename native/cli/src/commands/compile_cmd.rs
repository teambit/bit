//! Native `bit compile [component-names...]` (`scopes/compilation/compiler/compiler.cmd.ts`).

pub(in crate::commands) mod syntax;

mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    remote_action::startup,
    scope_set::{
        Failure,
        selection::{validate_component_name, validate_scope_name},
    },
    workspace_command,
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "compile", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub components: Vec<String>,
    pub changed: bool,
    pub verbose: bool,
    pub json: bool,
    pub delete_dist_dir: bool,
    pub generate_types: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("compile arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native compile grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI compile delegated".into()));
        }

        return workspace_command::execute_without_loader_scope(&cwd, args, "compile", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    };
    if env::var_os("CI").is_none_or(|val| val.is_empty())
        && let Some(err) = validate_compile_selectors(&root, &options)
    {
        return emit_compile_error(&root, args, options.json, err);
    }
    if let Some(outcome) = runner::try_run(&root, args, &options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("compile execution delegated".into()))
}

fn emit_compile_error(
    root: &Path,
    args: &[OsString],
    json: bool,
    err: String,
) -> io::Result<Outcome> {
    if json {
        workspace_command::execute_json(root, args, "compile", move |_| Err(io::Error::other(err)))
    } else {
        workspace_command::execute_then(root, args, "compile", move |output| {
            output.status("compiling components...");
            Err(io::Error::other(err))
        })
    }
}

pub(super) fn validate_compile_selectors(root: &Path, options: &Options) -> Option<String> {
    if options.components.is_empty() {
        return None;
    }
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    if !startup::service_supported(root, &ws_config).ok()?
        || ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true
    {
        return None;
    }
    let default_scope = ws_config["teambit.workspace/workspace"]["defaultScope"].as_str();
    let bitmap = Bitmap::load(root, default_scope).ok()?;
    let index_val = fs::read(workspace::scope_path(root).join("index.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .unwrap_or_default();
    let index_rows = index_val["components"]
        .as_array()
        .or_else(|| index_val.as_array())
        .map_or(&[][..], Vec::as_slice);
    options.components.iter().find_map(|sel| validate_one_selector(sel, &bitmap, index_rows))
}

fn validate_one_selector(selector: &str, bitmap: &Bitmap, index_rows: &[Value]) -> Option<String> {
    if selector.starts_with('@') {
        return None;
    }
    let (bare, _) = selector
        .split_once('@')
        .unwrap_or((selector, ""));
    if bare.is_empty() || exists_in_bitmap_or_index(bare, bitmap, index_rows) {
        return None;
    }
    let Some((scope, name)) = bare.split_once('/') else {
        return Some(format!(
            r#"error: component ID "{selector}" is invalid, please use the following format: [scope]/<name>"#,
        ));
    };
    if let Err(Failure::User(err)) = validate_scope_name(scope) {
        return Some(err);
    }
    if let Err(Failure::User(err)) = validate_component_name(name) {
        return Some(err);
    }
    None
}

fn exists_in_bitmap_or_index(bare: &str, bitmap: &Bitmap, index_rows: &[Value]) -> bool {
    let norm_dir = bare.trim_start_matches("./").trim_end_matches('/');
    let in_bitmap = bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .any(|entry| {
            entry.id.name == bare
                || entry.id.to_string_without_version() == bare
                || (!norm_dir.is_empty() && entry.root_dir.trim_end_matches('/') == norm_dir)
        });
    let in_index = index_rows
        .iter()
        .any(|row| {
            row["isSymlink"] != true
                && (row["id"]["name"].as_str() == Some(bare)
                    || match (row["id"]["scope"].as_str(), row["id"]["name"].as_str()) {
                        (Some(scope), Some(name)) if !scope.is_empty() => {
                            format!("{scope}/{name}") == bare
                        }
                        _ => false,
                    })
        });
    in_bitmap || in_index
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-c" | "--changed" | "--changed=true" => options.changed = true,
            "--changed=false" => options.changed = false,
            "-v" | "--verbose" | "--verbose=true" => options.verbose = true,
            "--verbose=false" => options.verbose = false,
            "-j" | "--json" | "--json=true" => options.json = true,
            "--json=false" => options.json = false,
            "-d" | "--delete-dist-dir" | "--delete-dist-dir=true" => options.delete_dist_dir = true,
            "--delete-dist-dir=false" => options.delete_dist_dir = false,
            "--generate-types" | "--generate-types=true" => options.generate_types = true,
            "--generate-types=false" => options.generate_types = false,
            val if !val.starts_with('-') && !val.is_empty() => {
                options.components.push(val.to_owned());
            }
            val => apply_short_compile_flags(val, &mut options)?,
        }
    }
    Some(options)
}

fn apply_short_compile_flags(arg: &str, options: &mut Options) -> Option<()> {
    let flags = arg.strip_prefix('-')?;
    if flags.is_empty() || flags.starts_with('-') {
        return None;
    }
    for ch in flags.chars() {
        match ch {
            'c' => options.changed = true,
            'v' => options.verbose = true,
            'j' => options.json = true,
            'd' => options.delete_dist_dir = true,
            _ => return None,
        }
    }
    Some(())
}
