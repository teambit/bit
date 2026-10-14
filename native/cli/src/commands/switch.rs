//! Native local `bit switch <lane> --skip-fetch -x` through the workspace
//! command's prepare, plan, capture and apply lifecycle.

mod options;
mod report;

use super::workspace_command::{self, Request};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "switch", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native switch grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let request =
        Request { operation: "switch", options: options.request(), to: None, verify_fresh: false };
    let prepared = workspace_command::plan(&root, &request)
        .and_then(|planned| {
            let chalk = super::color::Chalk::detect(args);
            let report = report::format(&planned.plan["result"], &options, chalk)?;
            let import_count = planned.plan["switchImportCount"]
                .as_u64()
                .filter(|count| *count <= 4096)
                .ok_or_else(|| io::Error::other("native switch import progress receipt"))?;
            Ok((planned, report, import_count))
        });
    let (planned, report, import_count) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("switch: {error}"))),
    };
    workspace_command::execute(&root, args, "switch", planned, &report, |output| {
        render_import(output, import_count);
    })
}

fn render_import(output: &Output, count: u64) {
    output.restart(&format!("importing {count} components"));
    output.restart(&format!("successfully imported {count} components"));
}
