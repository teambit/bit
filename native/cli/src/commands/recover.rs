//! Restore a locally soft-deleted mainline component from its local scope.

use super::{
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::component_recover::Plan;
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "recover", aliases: &[], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some(name) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native recover grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let plan = match Plan::prepare(&root, name) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("recover: {error}"))),
    };
    let format = Formatter::new(Chalk::detect(args));
    let report = Report {
        data: format!(
            "{}\n{}",
            format.success_summary("successfully recovered the following component(s)"),
            format.item(plan.full_id()),
        ),
        code: 0,
        details: None,
    };
    let file_id = workspace_command::file_id();
    workspace_command::execute_with(&root, args, "recover", &report, |_output| {
        plan.commit(&file_id)
    })
}
fn parse<'a>(args: &[&'a str]) -> Option<&'a str> {
    match args {
        [name] if !name.starts_with('-') => Some(name),
        [name, "-x" | "--skip-dependency-installation"]
        | ["-x" | "--skip-dependency-installation", name]
            if !name.starts_with('-') =>
        {
            Some(name)
        }
        _ => None,
    }
}
