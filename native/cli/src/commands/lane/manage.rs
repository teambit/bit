//! Local, unexported lane metadata changes.
use crate::{
    commands::{
        color::Chalk,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use bit_object_import::lane_manage::{Change, Plan, ReadmePlan};
use std::{env, ffi::OsString, io};

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
