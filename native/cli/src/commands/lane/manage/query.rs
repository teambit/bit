//! Native `bit lane updates` and `bit lane history-diff` scope validation.

use super::{
    super::{list, scope_root},
    outside_workspace_failure,
};
use crate::{
    commands::debug_cat::{
        emit_failure,
        lookup::{diagnose_lane_lookup_error, resolve_lane_entry},
        scope_dir_for,
    },
    native::Outcome,
};
use std::{env, ffi::OsString, io, path::Path};

pub(in crate::commands::lane) fn updates(
    args: &[OsString],
    lane_args: &[&str],
) -> io::Result<Outcome> {
    let Some((lane_name, json)) = parse_updates_args(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane updates grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        if lane_name.is_none() {
            return outside_workspace_failure(
                &env::current_dir()?,
                args,
                "updates",
                r#"unable to detect the current lane, specify a lane name, e.g. "bit lane updates scope/name""#,
            );
        }
        return Ok(Outcome::Declined("lane updates outside workspace delegated".into()));
    };
    updates_in_scope(&root, args, lane_name, json)
}

fn updates_in_scope(
    root: &scope_root::ScopeRoot,
    args: &[OsString],
    lane_name: Option<&str>,
    json: bool,
) -> io::Result<Outcome> {
    if root.bare && lane_name.is_none() {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI lane updates bare scope delegated".into()));
        }
        return emit_failure(
            root,
            args,
            "updates",
            true,
            json,
            r#"unable to detect the current lane, specify a lane name, e.g. "bit lane updates scope/name""#.into(),
        );
    }
    let is_main = match lane_name {
        Some(name) => name == "main",
        None => is_checked_out_to_main(&root.path)?,
    };
    if is_main {
        return emit_failure(
            root,
            args,
            "updates",
            true,
            json,
            "the default lane (main) has no cascaded updates. switch to a lane or specify a lane name".into(),
        );
    }
    if let Some(name) = lane_name
        && let Some(err) = unscoped_lane_error(&scope_dir_for(root), name)
    {
        return emit_failure(root, args, "updates", true, json, err);
    }
    Ok(Outcome::Declined("lane updates remote lookup delegated".into()))
}

fn parse_updates_args<'a>(lane_args: &[&'a str]) -> Option<(Option<&'a str>, bool)> {
    let mut lane_name = None;
    let mut json = false;
    let mut iter = lane_args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                match (iter.next(), iter.next()) {
                    (None, None) => {}
                    (Some(val), None) if !val.is_empty() && lane_name.is_none() => {
                        lane_name = Some(val);
                    }
                    _ => return None,
                }
                break;
            }
            "--undo" | "--undo=true" | "--undo=false" | "--no-color" | "--no-color=true"
            | "--no-color=false" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            val if !val.starts_with('-') && !val.is_empty() && lane_name.is_none() => {
                lane_name = Some(val);
            }
            _ => return None,
        }
    }
    Some((lane_name, json))
}

pub(in crate::commands::lane) fn history_diff(
    args: &[OsString],
    lane_args: &[&str],
) -> io::Result<Outcome> {
    let Some((lane_name, json)) = parse_history_diff_args(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane history-diff grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        if lane_name.is_none_or(|name| name == "main") {
            return outside_workspace_failure(
                &env::current_dir()?,
                args,
                "history-diff",
                "unable to show diff-history of the default lane (main)",
            );
        }
        return Ok(Outcome::Declined("lane history-diff outside workspace delegated".into()));
    };
    history_diff_in_scope(&root, args, lane_name, json)
}

fn history_diff_in_scope(
    root: &scope_root::ScopeRoot,
    args: &[OsString],
    lane_name: Option<&str>,
    json: bool,
) -> io::Result<Outcome> {
    let is_main = match lane_name {
        Some(name) => name == "main",
        None => root.bare || is_checked_out_to_main(&root.path)?,
    };
    if is_main {
        if root.bare && env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI lane history-diff bare scope delegated".into()));
        }
        return emit_failure(
            root,
            args,
            "history-diff",
            true,
            json,
            "unable to show diff-history of the default lane (main)".into(),
        );
    }
    if let Some(name) = lane_name
        && let Some(err) = unscoped_lane_error(&scope_dir_for(root), name)
    {
        return emit_failure(root, args, "history-diff", true, json, err);
    }
    Ok(Outcome::Declined("lane history-diff remote lookup delegated".into()))
}

fn parse_history_diff_args<'a>(lane_args: &[&'a str]) -> Option<(Option<&'a str>, bool)> {
    let mut lane_name = None;
    let mut json = false;
    let mut iter = lane_args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => break,
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-l" | "--lane" => lane_name = Some(non_flag(iter.next()?)?),
            "--pattern" => {
                non_flag(iter.next()?)?;
            }
            _ if let Some(val) = arg
                .strip_prefix("--lane=")
                .or_else(|| arg.strip_prefix("-l=")) =>
            {
                lane_name = Some(non_flag(val)?);
            }
            _ if let Some(val) = arg.strip_prefix("--pattern=") => {
                non_flag(val)?;
            }
            val if !val.starts_with('-') => {}
            _ => return None,
        }
    }
    Some((lane_name, json))
}

fn non_flag(val: &str) -> Option<&str> {
    let trimmed = val.trim();
    (!trimmed.is_empty() && !trimmed.starts_with('-')).then_some(trimmed)
}

fn unscoped_lane_error(scope_dir: &Path, name: &str) -> Option<String> {
    if name.contains('/')
        || name == "main"
        || env::var_os("CI").is_some_and(|val| !val.is_empty())
        || resolve_lane_entry(scope_dir, name).is_some()
    {
        return None;
    }
    let err = diagnose_lane_lookup_error(scope_dir, name, false)?;
    (!err.ends_with("was not found!")).then_some(err)
}

fn is_checked_out_to_main(root: &Path) -> io::Result<bool> {
    let (current, _) = list::read_current(root)?;
    Ok(current["name"] == "main")
}
