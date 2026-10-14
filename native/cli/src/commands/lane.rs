//! Native `bit lane merge <lane> [pattern] -x`: a merge workspace command
//! (`workspace_command`) with the lane options, the lane step, and the whole
//! merge report. Other `bit lane` commands are left to the Node.js CLI.

mod options;

use super::{
    color::Chalk,
    merge::{force_local_build, report},
    workspace_command::{self, Request, progress::Progress},
};
use crate::{commands::Command, native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "lane", aliases: &["l"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    if argv.get(1) != Some(&"merge") {
        return Ok(Outcome::Declined("a lane command other than merge".to_string()));
    }
    let Some(options) = options::parse(&argv[2..]) else {
        return Ok(Outcome::Declined("outside the native lane merge grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if force_local_build(&root) {
        return Ok(Outcome::Declined("force_local_build may be set".to_string()));
    }
    let request =
        Request { operation: "merge", options: options.request(), to: None, verify_fresh: true };
    let mode = report::Mode { verbose: options.verbose, lane: true };
    let prepared = workspace_command::plan(&root, &request)
        .and_then(|planned| {
            let report = report::format(&planned.plan["result"], mode, Chalk::detect(args))?;
            let progress = Progress::parse(planned.plan.get("progress"))?;
            Ok((planned, report, progress))
        });
    let (planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("lane merge: {error}"))),
    };
    workspace_command::execute(&root, args, "merge", planned, &report, |output| {
        if let Some(progress) = &progress {
            progress.render_merge(output);
        }
    })
}
