//! Capsule root path selection ([`compute_capsules_root_dirs`], [`resolve_capsules_dir`]) and base-directory validation.
//!
//! Parses [`CreateArgs`] flags via [`parse_create_flags`] and resolves target capsule directories.

use super::{
    super::{
        ScopeRoot, Subcommand, compute_capsules_root_dirs, object_hash_short, resolve_capsules_dir,
    },
    CreateArgs,
};
use std::{
    io,
    path::{Component, Path, PathBuf},
};

/// Parses `bit capsule create` CLI flags and trailing positional arguments into a [`Subcommand`].
pub(in crate::commands::capsule) fn parse_create_flags(rest: &[&str]) -> Option<Subcommand> {
    let mut create = CreateArgs::default();
    let mut args = rest.iter().copied();
    while let Some(arg) = args.next() {
        if arg == "--" {
            consume_trailing_capsule_ids(args, &mut create.ids)?;
            break;
        }
        apply_create_arg(arg, &mut args, &mut create)?;
    }
    Some(Subcommand::Create(create))
}

/// Appends non-flag positional component IDs after `--` into `ids`.
fn consume_trailing_capsule_ids<'a>(
    args: impl Iterator<Item = &'a str>,
    ids: &mut Vec<String>,
) -> Option<()> {
    for trailing in args {
        let trimmed = trailing.trim();
        (!trimmed.is_empty() && !trimmed.starts_with('-')).then_some(())?;
        ids.push(trimmed.to_owned());
    }
    Some(())
}

/// Applies a single `bit capsule create` CLI argument `arg` (and any value from `args`) to `create`.
fn apply_create_arg<'a>(
    arg: &'a str,
    args: &mut impl Iterator<Item = &'a str>,
    create: &mut CreateArgs,
) -> Option<()> {
    if apply_create_bool(arg, create) || apply_create_combined_short(arg, create) {
        return Some(());
    }
    match arg {
        "-i" | "--id" => create.name = Some(next_option_value(args)?.to_owned()),
        "-b" | "--base-dir" => create.base_dir = Some(next_option_value(args)?.to_owned()),
        "-r" | "--root-base-dir" => {
            create.root_base_dir = Some(next_option_value(args)?.to_owned());
        }
        "-p" | "--package-manager" => {
            let _ = next_option_value(args)?;
        }
        _ => apply_create_inline_or_id(arg, create)?,
    }
    Some(())
}

/// Applies a boolean flag (`--json`, `--seeders-only`, `--always-new`, `--use-hash`, `--install-packages=false`) to `create`.
fn apply_create_bool(arg: &str, create: &mut CreateArgs) -> bool {
    let Some((flag, val)) = parse_bool_flag(arg) else {
        return false;
    };
    let allow_false = val || arg.starts_with("--");
    match flag {
        "--install-packages" if !val => return true,
        "-j" | "--json" if allow_false => create.json = val,
        "-s" | "--seeders-only" if allow_false => create.seeders_only = val,
        "-a" | "--always-new" if allow_false => create.always_new = val,
        "--use-hash" => create.use_hash = val,
        _ => return false,
    }
    true
}

/// Splits `arg` into a flag name and boolean value (`true`/`1` or `false`/`0`).
#[inline]
fn parse_bool_flag(arg: &str) -> Option<(&str, bool)> {
    let Some((flag, raw)) = arg.split_once('=') else {
        return Some((arg.trim(), true));
    };
    let raw = raw.trim();
    if raw.eq_ignore_ascii_case("true") || raw == "1" {
        Some((flag.trim(), true))
    } else if raw.eq_ignore_ascii_case("false") || raw == "0" {
        Some((flag.trim(), false))
    } else {
        None
    }
}

fn apply_create_inline_or_id(arg: &str, create: &mut CreateArgs) -> Option<()> {
    if let Some((key, val)) = arg.split_once('=') {
        let val = val.trim();
        if val.is_empty() || val.starts_with('-') {
            return None;
        }
        match key.trim() {
            "--id" | "-i" => create.name = Some(val.to_owned()),
            "--base-dir" | "-b" => create.base_dir = Some(val.to_owned()),
            "--root-base-dir" | "-r" => create.root_base_dir = Some(val.to_owned()),
            "--package-manager" | "-p" => {}
            _ => return None,
        }
    } else if !arg.starts_with('-') && !arg.trim().is_empty() {
        create.ids.push(arg.trim().to_owned());
    } else {
        return None;
    }
    Some(())
}

fn apply_create_combined_short(arg: &str, create: &mut CreateArgs) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'j' | b's' | b'a'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        match byte {
            b'j' => create.json = true,
            b's' => create.seeders_only = true,
            _ => create.always_new = true,
        }
    }
    true
}

#[inline]
fn next_option_value<'a>(args: &mut impl Iterator<Item = &'a str>) -> Option<&'a str> {
    let value = args.next()?.trim();
    (!value.is_empty() && !value.starts_with('-')).then_some(value)
}

pub(super) fn resolve_create_root(
    cwd: &Path,
    root: &ScopeRoot,
    create_args: &CreateArgs,
) -> io::Result<PathBuf> {
    let default_root = PathBuf::from(resolve_capsules_dir(cwd)?);
    let root_base = match &create_args.root_base_dir {
        Some(value) => validate_root_base_dir(value, cwd)?,
        None => default_root.clone(),
    };
    if let Some(base_dir) = &create_args.base_dir {
        let relative = validate_base_dir(base_dir)?;
        return Ok(normalize_lexical(&root_base.join(if create_args.use_hash {
            PathBuf::from(object_hash_short(base_dir))
        } else {
            relative
        })));
    }
    if create_args.use_hash {
        return Ok(root_base.join(object_hash_short(&root.path.to_string_lossy())));
    }
    let dirs = compute_capsules_root_dirs(cwd, root)?;
    let ws_dir = PathBuf::from(dirs.workspace.ok_or_else(|| {
        io::Error::other("missing workspace capsules root dir")
    })?);
    if create_args.root_base_dir.is_none() {
        return Ok(ws_dir);
    }
    let sub = ws_dir
        .strip_prefix(&default_root)
        .map_err(|_| io::Error::other("custom capsule root cannot map workspace path"))?;
    Ok(root_base.join(sub))
}

fn validate_base_dir(value: &str) -> io::Result<PathBuf> {
    let path = Path::new(value);
    let unix_absolute = cfg!(unix) && path.is_absolute();
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|part| {
                !(matches!(part, Component::Normal(_) | Component::CurDir | Component::ParentDir)
                    || unix_absolute && matches!(part, Component::RootDir))
            })
    {
        return Err(io::Error::other("unsupported capsule base dir"));
    }
    let relative = path
        .components()
        .filter_map(|part| match part {
            Component::Normal(_) | Component::ParentDir => Some(part.as_os_str()),
            _ => None,
        })
        .collect::<PathBuf>();
    if relative.as_os_str().is_empty() {
        return Err(io::Error::other("unsupported capsule base dir"));
    }
    Ok(relative)
}

fn validate_root_base_dir(value: &str, cwd: &Path) -> io::Result<PathBuf> {
    let path = Path::new(value);
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|part| {
                !matches!(
                    part,
                    Component::Prefix(_)
                        | Component::RootDir
                        | Component::CurDir
                        | Component::ParentDir
                        | Component::Normal(_),
                )
            })
    {
        return Err(io::Error::other("unsupported capsule root base dir"));
    }
    let joined = if path.is_absolute() { path.to_path_buf() } else { cwd.join(path) };
    Ok(normalize_lexical(&joined))
}

#[inline]
fn normalize_lexical(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}
