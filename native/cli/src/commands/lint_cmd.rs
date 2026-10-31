//! Native `bit lint [component-pattern]` (`scopes/defender/linter/lint.cmd.ts`).

mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    debug_cat::lookup::{load_cat_component, resolve_component_entry},
    lane::scope_root::ScopeRoot,
    remote_action::startup,
    scope_set::{Failure, selection},
    workspace_command,
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::{Bitmap, BitmapEntry, ScopeObjects, sha1_hex};
use bit_object_import::parse_jsonc;
use serde_json::{Map, Value};
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "lint", aliases: &[], run };

const HOST_NOT_FOUND_ERR: &str = "Host was not found";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub changed: bool,
    pub fix: bool,
    pub fix_type: Option<String>,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("lint arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native lint grammar".into()));
    };
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        if env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) =
                validate_lint_pattern(&root, options.pattern.as_deref(), Chalk::detect(args))
        {
            return emit_pattern_error(&root, args, "lint", options.json, err);
        }
        return runner::run(&root, args, &options);
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI lint delegated".into()));
    }
    if is_missing_host(&cwd) {
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "lint",
            options.json,
            "",
            io::Error::other(HOST_NOT_FOUND_ERR),
        );
    }
    workspace_command::execute_failure_scope(
        &cwd,
        args,
        "lint",
        options.json,
        "",
        io::Error::other(bare_scope_error(options.pattern.as_deref(), options.changed)),
    )
}

pub(super) fn bare_scope_error(pattern: Option<&str>, changed: bool) -> &'static str {
    if pattern.is_some_and(|pat| !pat.trim().is_empty()) {
        "Cannot read properties of undefined (reading 'idsByPattern')"
    } else if changed {
        "Cannot read properties of undefined (reading 'getNewAndModifiedIds')"
    } else {
        "Cannot read properties of undefined (reading 'getMany')"
    }
}

pub(in crate::commands) fn consume_trailing_internalize<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        (!val.is_empty() && !val.starts_with('-') && pattern.replace(val.to_owned()).is_none())
            .then_some(())?;
    }
    Some(())
}

pub(super) fn read_model_object(
    objects: &ScopeObjects,
    scope: &str,
    name: &str,
) -> Result<Value, Failure> {
    objects
        .read(&sha1_hex(&format!("{scope}/{name}")))
        .and_then(|opt| match opt {
            Some(model) => Ok(Some(model)),
            None => objects.read(&sha1_hex(name)),
        })
        .map_err(|err| Failure::Declined(err.to_string()))?
        .ok_or_else(|| Failure::Declined("missing model object on eject-conf".into()))
}

pub(super) fn load_version_extensions(
    objects: &ScopeObjects,
    scope: &str,
    entry: &BitmapEntry,
) -> Result<Vec<Value>, Failure> {
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return Ok(Vec::new());
    };
    let ver_hash = if ver.len() == 40 && ver.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        ver.to_owned()
    } else {
        let model = read_model_object(objects, scope, &entry.id.name)?;
        let resolved = if matches!(ver, "latest" | "head") {
            model["head"].as_str()
        } else {
            model["versions"][ver]
                .as_str()
                .or_else(|| model["orphanedVersions"][ver].as_str())
        };
        resolved
            .map(str::to_owned)
            .ok_or_else(|| Failure::Declined("missing version in model on eject-conf".into()))?
    };
    let version_obj = objects
        .read(&ver_hash)
        .map_err(|err| Failure::Declined(err.to_string()))?
        .ok_or_else(|| Failure::Declined("missing version object on eject-conf".into()))?;
    Ok(version_obj["extensions"]
        .as_array()
        .cloned()
        .unwrap_or_default())
}

pub(super) fn strip_local_env_version(
    bitmap: &Bitmap,
    cfg_map: Map<String, Value>,
) -> Map<String, Value> {
    let local_env = cfg_map
        .iter()
        .find(|(key, _)| {
            key.as_str() == "teambit.envs/envs" || key.starts_with("teambit.envs/envs@")
        })
        .and_then(|(_, val)| val["env"].as_str())
        .map(|env| env.split('@').next().unwrap_or(env))
        .filter(|bare| {
            !bare.is_empty()
                && bitmap.entries
                    .iter()
                    .any(|entry| {
                        entry.owns_its_dir() && entry.id.to_string_without_version() == *bare
                    })
        })
        .map(str::to_owned);
    cfg_map
        .into_iter()
        .filter(|(_, val)| val.as_str() != Some("-"))
        .map(|(key, val)| match local_env.as_deref() {
            Some(bare) if key.starts_with(&format!("{bare}@")) => (bare.to_owned(), val),
            _ => (key, val),
        })
        .collect()
}

pub(super) fn has_variants_internalize_config(workspace_val: &Value) -> bool {
    let Some(rows) = workspace_val.as_object() else {
        return false;
    };
    rows.iter()
        .find(|(key, _)| key.split('@').next() == Some("teambit.workspace/variants"))
        .is_some_and(|(_, val)| val.to_string().contains("teambit.component/internalize"))
}

pub(super) fn is_comp_json_entry_internal(
    root: &Path,
    entry: &BitmapEntry,
    aspect_id: &str,
) -> Result<Option<bool>, Failure> {
    if entry.root_dir.is_empty() {
        return Ok(None);
    }
    let comp_json_path = root.join(&entry.root_dir).join("component.json");
    if !comp_json_path.exists() {
        return Ok(None);
    }
    let parsed: Value = parse_jsonc(&fs::read(&comp_json_path)?)?;
    let Some((_, cfg)) = super::update_cmd::aspect_entry(&parsed["extensions"], aspect_id) else {
        return Ok(None);
    };
    if cfg.as_str() == Some("-") {
        return Ok(Some(false));
    }
    Ok(Some(cfg["internal"].as_bool().unwrap_or(false)))
}

pub(super) fn is_scope_entry_internal(
    root: &Path,
    entry: &BitmapEntry,
    aspect_id: &str,
) -> Result<bool, Failure> {
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
    let exts = if let Some(ver_val) =
        load_cat_component(&scope_root, &scope_dir, &format!("{bare_id}@{ver}"))
    {
        ver_val["extensions"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    } else {
        let scope = entry.id.scope.as_deref().unwrap_or_default();
        load_version_extensions(&ScopeObjects::new(&scope_dir), scope, entry)?
    };
    let ext = exts.iter().find(|ext| super::update_cmd::matches_aspect(ext, aspect_id));
    Ok(ext.is_some_and(|item| item["config"]["internal"].as_bool().unwrap_or(false)))
}

pub(super) fn emit_pattern_error(
    root: &Path,
    args: &[OsString],
    cmd: &'static str,
    json: bool,
    err: String,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI pattern error stack".into()));
    }
    if json {
        workspace_command::execute_json(root, args, cmd, move |_| Err(io::Error::other(err)))
    } else {
        workspace_command::execute_then(root, args, cmd, move |_| Err(io::Error::other(err)))
    }
}

pub(super) fn validate_lint_pattern(
    root: &Path,
    pattern: Option<&str>,
    chalk: Chalk,
) -> Option<String> {
    let pat = pattern?;
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    if !startup::service_supported(root, &ws_config).ok()?
        || super::build_cmd::is_bitmap_auto_sync(&ws_config)
    {
        return None;
    }
    let default_scope = super::aspect::workspace_default_scope(&ws_config).ok();
    let bitmap = Bitmap::load(root, default_scope.as_deref()).ok()?;
    match selection::resolve_pattern_entries(root, &bitmap, pat, chalk) {
        Err(Failure::User(msg)) => Some(msg),
        _ => None,
    }
}

pub(super) fn is_missing_host(cwd: &Path) -> bool {
    workspace::root(cwd).is_none()
        && !cwd
            .ancestors()
            .any(|dir| {
                dir.join("scope.json").is_file()
                    || dir.join(".bit").is_dir()
                    || dir.join(".git/bit").is_dir()
            })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            consume_trailing_lint_pattern(iter, &mut options.pattern)?;
            break;
        }
        apply_token(arg, &mut iter, &mut options)?;
    }
    Some(options)
}

fn consume_trailing_lint_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        let val = val.trim();
        (!val.is_empty() && !val.starts_with('-') && pattern.replace(val.to_owned()).is_none())
            .then_some(())?;
    }
    Some(())
}

fn apply_token<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
        | "--color=false" | "--color=always" | "--color=never" => {}
        "-c" | "--changed" | "--changed=true" => options.changed = true,
        "--changed=false" => options.changed = false,
        "-f" | "--fix" | "--fix=true" => options.fix = true,
        "--fix=false" => options.fix = false,
        "-j" | "--json" | "--json=true" => options.json = true,
        "--json=false" => options.json = false,
        "--fix-type" => {
            let val = iter.next()?.trim();
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            options.fix_type = Some(val.to_owned());
        }
        _ => apply_inline_or_pattern(arg, options)?,
    }
    Some(())
}

fn apply_inline_or_pattern(arg: &str, options: &mut Options) -> Option<()> {
    if apply_combined_short(arg, options) {
        return Some(());
    }
    if let Some(val) = arg.strip_prefix("--fix-type=") {
        let val = val.trim();
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.fix_type = Some(val.to_owned());
    } else if !arg.trim().starts_with('-')
        && !arg.trim().is_empty()
        && options.pattern.is_none()
    {
        options.pattern = Some(arg.trim().to_owned());
    } else {
        return None;
    }
    Some(())
}

fn apply_combined_short(arg: &str, options: &mut Options) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'c' | b'f' | b'j'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        match byte {
            b'c' => options.changed = true,
            b'f' => options.fix = true,
            _ => options.json = true,
        }
    }
    true
}
