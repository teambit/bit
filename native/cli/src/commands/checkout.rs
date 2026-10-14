//! Native `bit checkout <to> [component-pattern] -x`, a workspace command
//! (`workspace_command`) with the checkout options and report.

mod options;
mod report;

use super::workspace_command::{self, Request, progress::Progress};
use crate::{commands::Command, native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "checkout", aliases: &["U"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native checkout grammar".to_string()));
    };
    // Harmony imports nothing for `main` where the engine reports a version
    // import, so the progress lines would differ.
    if options.to == "main" {
        return Ok(Outcome::Declined("checkout main progress".to_string()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let request = Request {
        operation: "checkout",
        options: options.request(),
        to: Some(&options.to),
        verify_fresh: false,
    };
    let prepared = workspace_command::plan(&root, &request)
        .and_then(|planned| {
            let chalk = super::color::Chalk::detect(args);
            let report = report::format(&planned.plan["result"], &options, chalk)?;
            let progress = Progress::parse(planned.plan.get("progress"))?;
            Ok((planned, report, progress))
        });
    let (planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("checkout: {error}"))),
    };
    workspace_command::execute(&root, args, "checkout", planned, &report, |output| {
        if let Some(progress) = &progress {
            progress.render_checkout(output);
        }
    })
}
