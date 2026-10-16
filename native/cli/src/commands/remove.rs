//! Native local untracking for a clean, new component.

use super::{
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::component_remove::Plan;
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "remove", aliases: &["rm"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some((name, keep_files)) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native remove grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let plan = match Plan::prepare(&root, name, keep_files) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("remove: {error}"))),
    };
    let format = Formatter::new(Chalk::detect(args));
    let report = Report {
        data: format!(
            "{}\n{}",
            format.success_summary("successfully removed components from the local workspace"),
            format.item(plan.identity()),
        ),
        code: 0,
        details: None,
    };
    let file_id = workspace_command::file_id();
    workspace_command::execute_with(&root, args, "remove", &report, |output| {
        for status in ["removing components", "removing components", "loading 1 component(s)"] {
            output.status(status);
        }
        if plan.main_exists() {
            output.status("loading 1 component(s)");
        }
        plan.commit(&file_id)
    })
}

fn parse<'a>(args: &[&'a str]) -> Option<(&'a str, bool)> {
    let mut name = None;
    let mut silent = false;
    let mut keep_files = false;
    for arg in args {
        match *arg {
            "-s" | "--silent" if !silent => silent = true,
            "--keep-files" if !keep_files => keep_files = true,
            value if !value.starts_with('-') && name.is_none() => name = Some(value),
            _ => return None,
        }
    }
    silent.then_some((name?, keep_files))
}
