//! Local, unexported lane metadata changes.
use super::{list, scope_root};
use crate::{
    commands::{
        color::Chalk,
        debug_cat::{
            emit_failure,
            lookup::{diagnose_lane_lookup_error, resolve_lane_entry},
            scope_dir_for,
        },
        engine::Engine,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use bit_object_import::{
    component_remove::select_ids,
    lane_manage::{Change, Plan, ReadmePlan},
};
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path};

pub(super) fn rename(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let [new_name] = lane_args else {
        return Ok(Outcome::Declined("outside the native lane rename grammar".into()));
    };
    execute(args, Change::Rename(new_name), "rename", |plan, chalk| {
        format!(
            "the lane {}'s name has been changed to {}.",
            chalk.bold(plan.old_name()),
            chalk.bold(new_name),
        )
    })
}

pub(super) fn change_scope(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let [new_scope] = lane_args else {
        return Ok(Outcome::Declined("outside the native lane change-scope grammar".into()));
    };
    execute(args, Change::Scope(new_scope), "change-scope", |plan, chalk| {
        format!(
            "the remote-scope of {} has been changed from {} to {}",
            chalk.bold(plan.old_name()),
            chalk.bold(plan.old_scope()),
            chalk.bold(new_scope),
        )
    })
}

pub(super) fn remove_readme(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let lane_name = match lane_args {
        [] => None,
        [name] if !name.is_empty() && !name.starts_with('-') => Some(*name),
        _ => return Ok(Outcome::Declined("outside the native lane remove-readme grammar".into())),
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let user = workspace_command::User::load(&root)?;
    let plan =
        match ReadmePlan::prepare(&root, lane_name, user.log(), &workspace_command::uuid_v4()?) {
            Ok(plan) => plan,
            Err(error) => return Ok(Outcome::Declined(format!("lane remove-readme: {error}"))),
        };
    match plan {
        ReadmePlan::NoReadme(label) => {
            workspace_command::execute_then(&root, args, "remove-readme", |_| {
                Err(io::Error::other(format!(
                    "there is no readme component added to the lane {label}",
                )))
            })
        }
        ReadmePlan::Remove(ref removal) => {
            let chalk = Chalk::detect(args);
            let report = Report {
                data: chalk.green(&format!(
                    "the readme component has been successfully removed from the lane {}",
                    removal.label(),
                )),
                code: 0,
                details: None,
            };
            workspace_command::execute_with(&root, args, "remove-readme", &report, |_| {
                plan.commit()
            })
        }
    }
}

pub(super) fn remove_comp(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    if !valid_remove_comp_args(lane_args) {
        return Ok(Outcome::Declined("outside the native lane remove-comp grammar".into()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    workspace_command::execute_then(&root, args, "remove-comp", |_| {
        Err(io::Error::other(
            r#"bit lane remove-comp has been removed. please use "bit remove" or "bit delete" instead"#,
        ))
    })
}

fn valid_remove_comp_args(args: &[&str]) -> bool {
    let mut pattern_count = 0usize;
    for &arg in args {
        match arg {
            "--workspace-only"
            | "--workspace-only=true"
            | "--workspace-only=false"
            | "--update-main"
            | "--update-main=true"
            | "--update-main=false" => {}
            _ if !arg.starts_with('-') && !arg.is_empty() => pattern_count += 1,
            _ => return false,
        }
    }
    pattern_count == 1
}

fn execute(
    args: &[OsString],
    change: Change<'_>,
    command: &str,
    report: impl FnOnce(&Plan, Chalk) -> String,
) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let user = workspace_command::User::load(&root)?;
    let plan = match Plan::prepare(&root, change, user.log(), &workspace_command::uuid_v4()?) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("lane {command}: {error}"))),
    };
    let report = Report { data: report(&plan, Chalk::detect(args)), code: 0, details: None };
    workspace_command::execute_with(&root, args, command, &report, |_| plan.commit())
}

pub(super) fn fetch(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some((all, lane_id)) = parse_fetch_args(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane fetch grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    if all {
        return crate::commands::import::lane_fetch(&root, args, &["fetch", "-l"]);
    }
    if let Some(id) = lane_id {
        return crate::commands::import::lane_fetch(&root, args, &["fetch", "-l", id]);
    }
    let (current, _) = match list::read_current(&root) {
        Ok(current) => current,
        Err(error) => return Ok(Outcome::Declined(format!("lane fetch: {error}"))),
    };
    if current["name"] == "main" {
        return workspace_command::execute_then(&root, args, "fetch", |_| {
            Err(io::Error::other(
                "you are not checked out to any lane. please specify a lane-id to fetch or use --all flag",
            ))
        });
    }
    let current_id = format!(
        "{}/{}",
        current["scope"].as_str().unwrap_or_default(),
        current["name"].as_str().unwrap_or_default(),
    );
    crate::commands::import::lane_fetch(&root, args, &["fetch", "-l", &current_id])
}

fn parse_fetch_args<'a>(lane_args: &[&'a str]) -> Option<(bool, Option<&'a str>)> {
    let mut all = false;
    let mut lane_id = None;
    for &arg in lane_args {
        match arg {
            "-a" | "--all" if !all => all = true,
            val if !val.starts_with('-') && !val.is_empty() && lane_id.is_none() => {
                lane_id = Some(val);
            }
            _ => return None,
        }
    }
    Some((all, lane_id))
}

pub(super) fn eject(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let [pattern] = lane_args else {
        return Ok(Outcome::Declined("outside the native lane eject grammar".into()));
    };
    if pattern.starts_with('-') || pattern.is_empty() {
        return Ok(Outcome::Declined("outside the native lane eject grammar".into()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let ids = match select_ids(&root, pattern) {
        Ok(ids) => ids,
        Err(err) if err.kind() == io::ErrorKind::InvalidInput => {
            return workspace_command::execute_then(&root, args, "eject", |_| Err(err));
        }
        Err(err) => return Ok(Outcome::Declined(format!("lane eject: {err}"))),
    };
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({"kind": "scopeList", "root": root}))?;
    let Some(models) = listed["components"].as_array() else {
        return Ok(Outcome::Declined("lane eject: missing scope models".into()));
    };
    crate::commands::eject::eject_from_lane(&root, args, &ids, models)
}

pub(super) fn updates(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some((lane_name, json)) = parse_updates_args(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane updates grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("lane updates outside workspace delegated".into()));
    };
    if root.bare && lane_name.is_none() {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI lane updates bare scope delegated".into()));
        }
        return emit_failure(
            &root,
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
            &root,
            args,
            "updates",
            true,
            json,
            "the default lane (main) has no cascaded updates. switch to a lane or specify a lane name".into(),
        );
    }
    if let Some(name) = lane_name
        && let Some(err) = unscoped_lane_error(&scope_dir_for(&root), name)
    {
        return emit_failure(&root, args, "updates", true, json, err);
    }
    Ok(Outcome::Declined("lane updates remote lookup delegated".into()))
}

fn parse_updates_args<'a>(lane_args: &[&'a str]) -> Option<(Option<&'a str>, bool)> {
    let mut lane_name = None;
    let mut json = false;
    for &arg in lane_args {
        match arg {
            "--undo" | "--no-color" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--no-json" | "--json=false" => json = false,
            val if !val.starts_with('-') && !val.is_empty() && lane_name.is_none() => {
                lane_name = Some(val);
            }
            _ => return None,
        }
    }
    Some((lane_name, json))
}

pub(super) fn history_diff(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some((lane_name, json)) = parse_history_diff_args(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane history-diff grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("lane history-diff outside workspace delegated".into()));
    };
    let is_main = match lane_name {
        Some(name) => name == "main",
        None => root.bare || is_checked_out_to_main(&root.path)?,
    };
    if is_main {
        if root.bare && env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI lane history-diff bare scope delegated".into()));
        }
        return emit_failure(
            &root,
            args,
            "history-diff",
            true,
            json,
            "unable to show diff-history of the default lane (main)".into(),
        );
    }
    if let Some(name) = lane_name
        && let Some(err) = unscoped_lane_error(&scope_dir_for(&root), name)
    {
        return emit_failure(&root, args, "history-diff", true, json, err);
    }
    Ok(Outcome::Declined("lane history-diff remote lookup delegated".into()))
}

fn parse_history_diff_args<'a>(lane_args: &[&'a str]) -> Option<(Option<&'a str>, bool)> {
    let mut lane_name = None;
    let mut json = false;
    let mut iter = lane_args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--no-color" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--no-json" | "--json=false" => json = false,
            "-l" | "--lane" => {
                let val = iter
                    .next()
                    .filter(|val| !val.is_empty() && !val.starts_with('-'))?;
                lane_name = Some(val);
            }
            "--pattern" => {
                iter.next()?;
            }
            val if !val.starts_with('-') => {}
            _ => return None,
        }
    }
    Some((lane_name, json))
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
