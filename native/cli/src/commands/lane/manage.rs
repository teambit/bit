//! Local, unexported lane metadata changes.

pub(super) use query::{history_diff, updates};

mod query;

use super::list;
use crate::{
    commands::{
        color::Chalk,
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
    let Some((new_name, lane_name)) = parse_lane_target_args(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane rename grammar".into()));
    };
    execute(args, Change::Rename(new_name), lane_name, "rename", |plan, chalk| {
        format!(
            "the lane {}'s name has been changed to {}.",
            chalk.bold(plan.old_name()),
            chalk.bold(new_name),
        )
    })
}

pub(super) fn change_scope(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some((new_scope, lane_name)) = parse_lane_target_args(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane change-scope grammar".into()));
    };
    execute(args, Change::Scope(new_scope), lane_name, "change-scope", |plan, chalk| {
        format!(
            "the remote-scope of {} has been changed from {} to {}",
            chalk.bold(plan.old_name()),
            chalk.bold(plan.old_scope()),
            chalk.bold(new_scope),
        )
    })
}

fn parse_lane_target_args<'a>(args: &[&'a str]) -> Option<(&'a str, Option<&'a str>)> {
    let mut target = None;
    let mut lane_name = None;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            let val = iter.next()?;
            return (iter.next().is_none() && set_unique(&mut target, val)).then_some((
                target?, lane_name,
            ));
        }
        apply_lane_target_arg(arg, &mut iter, &mut target, &mut lane_name)?;
    }
    Some((target?, lane_name))
}

fn apply_lane_target_arg<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    target: &mut Option<&'a str>,
    lane_name: &mut Option<&'a str>,
) -> Option<()> {
    if arg == "--no-color" {
        return Some(());
    }
    if matches!(arg, "-l" | "--lane-name") {
        let val = iter.next()?;
        return (!val.starts_with('-') && set_unique(lane_name, val)).then_some(());
    }
    if let Some(val) = arg
        .strip_prefix("--lane-name=")
        .or_else(|| arg.strip_prefix("-l="))
    {
        return (!val.starts_with('-') && set_unique(lane_name, val)).then_some(());
    }
    (!arg.starts_with('-') && set_unique(target, arg)).then_some(())
}

fn set_unique<'a>(slot: &mut Option<&'a str>, val: &'a str) -> bool {
    !val.is_empty() && slot.replace(val).is_none()
}

pub(super) fn remove_readme(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(tokens) = crate::commands::scope_set::collect_non_flag_tokens(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane remove-readme grammar".into()));
    };
    let lane_name = match tokens.as_slice() {
        [] => None,
        [name] => Some(*name),
        _ => return Ok(Outcome::Declined("outside the native lane remove-readme grammar".into())),
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_failure(
            &cwd,
            args,
            "remove-readme",
            "unable to remove the lane readme component outside of Bit workspace",
        );
    };
    let user = workspace_command::User::load(&root)?;
    let plan =
        match ReadmePlan::prepare(&root, lane_name, user.log(), &workspace_command::uuid_v4()?) {
            Ok(plan) => plan,
            Err(error) => return Ok(Outcome::Declined(format!("lane remove-readme: {error}"))),
        };
    commit_readme_plan(&root, args, plan)
}

fn commit_readme_plan(root: &Path, args: &[OsString], plan: ReadmePlan) -> io::Result<Outcome> {
    match plan {
        ReadmePlan::NoReadme(label) => {
            workspace_command::execute_then(root, args, "remove-readme", |_| {
                Err(io::Error::other(format!(
                    "there is no readme component added to the lane {label}",
                )))
            })
        }
        ReadmePlan::Remove(ref removal) => {
            let data = Chalk::detect(args)
                .green(&format!(
                    "the readme component has been successfully removed from the lane {}",
                    removal.label(),
                ));
            let report = Report { data, code: 0, details: None };
            workspace_command::execute_with(root, args, "remove-readme", &report, |_| plan.commit())
        }
    }
}

pub(super) fn remove_comp(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    if !valid_remove_comp_args(lane_args) {
        return Ok(Outcome::Declined("outside the native lane remove-comp grammar".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_failure(
            &cwd,
            args,
            "remove-comp",
            r#"bit lane remove-comp has been removed. please use "bit remove" or "bit delete" instead"#,
        );
    };
    workspace_command::execute_then(&root, args, "remove-comp", |_| {
        Err(io::Error::other(
            r#"bit lane remove-comp has been removed. please use "bit remove" or "bit delete" instead"#,
        ))
    })
}

fn valid_remove_comp_args(args: &[&str]) -> bool {
    let mut pattern_count = 0usize;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => return count_trailing_patterns(iter, &mut pattern_count) && pattern_count == 1,
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

fn count_trailing_patterns<'a>(iter: impl Iterator<Item = &'a str>, count: &mut usize) -> bool {
    for rest in iter {
        if rest.is_empty() || rest.starts_with('-') {
            return false;
        }
        *count += 1;
    }
    true
}

fn execute(
    args: &[OsString],
    change: Change<'_>,
    lane_name: Option<&str>,
    command: &str,
    report: impl FnOnce(&Plan, Chalk) -> String,
) -> io::Result<Outcome> {
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        let msg = if command == "rename" {
            "unable to rename a lane outside of Bit workspace"
        } else {
            "unable to change-scope of a lane outside of Bit workspace"
        };
        return outside_workspace_failure(&cwd, args, command, msg);
    };
    if lane_name.is_some() {
        return Ok(Outcome::Declined(format!("lane {command}: explicit --lane-name")));
    }
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
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if !all && lane_id.is_none() {
            return outside_workspace_failure(
                &cwd,
                args,
                "fetch",
                "you are not checked out to any lane. please specify a lane-id to fetch or use --all flag",
            );
        }
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
    let mut iter = lane_args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                for val in iter {
                    (!val.is_empty() && !val.starts_with('-') && lane_id.replace(val).is_none())
                        .then_some(())?;
                }
                break;
            }
            "-a" | "--all" | "--all=true" => all = true,
            "--all=false" => all = false,
            val if !val.starts_with('-') && !val.is_empty() && lane_id.is_none() => {
                lane_id = Some(val);
            }
            _ => return None,
        }
    }
    Some((all, lane_id))
}

pub(super) fn eject(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(tokens) = crate::commands::scope_set::collect_non_flag_tokens(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane eject grammar".into()));
    };
    let [pattern] = tokens.as_slice() else {
        return Ok(Outcome::Declined("outside the native lane eject grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_failure(
            &cwd,
            args,
            "eject",
            "unable to eject a component outside of Bit workspace",
        );
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

fn outside_workspace_failure(
    cwd: &Path,
    args: &[OsString],
    command: &str,
    msg: &str,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    }
    workspace_command::execute_failure_scope(cwd, args, command, false, "", io::Error::other(msg))
}
