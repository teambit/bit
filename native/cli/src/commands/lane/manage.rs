//! Local, unexported lane metadata changes.
use crate::{
    commands::{
        color::Chalk,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use bit_object_import::lane_manage::{Change, Plan};
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
