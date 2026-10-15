//! Native `bit lane merge <lane> [pattern] -x`: a merge workspace command
//! (`workspace_command`) with the lane options, the lane step, and the whole
//! merge report; and `bit lane list` (`list`). Other `bit lane` commands are
//! left to the Node.js CLI.

mod current;
mod list;
mod options;
mod show;

use super::{
    color::Chalk,
    merge::{force_local_build, install, report},
    workspace_command::{self, Request, progress::Progress},
};
use crate::{commands::Command, native::Outcome, workspace};
use serde_json::Value;
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "lane", aliases: &["l"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    match argv.get(1).copied() {
        Some("list") => list::run(args, &argv[2..]),
        Some("current") => current::current(args, &argv[2..]),
        Some("show") => show::show(args, &argv[2..]),
        Some("merge") => merge(args, &argv),
        Some("merge-abort") => super::recovery::parse_lane(&argv[2..])
            .map_or_else(
                || Ok(Outcome::Declined("outside the native lane merge-abort grammar".to_string())),
                |options| super::recovery::run(args, &options),
            ),
        _ => Ok(Outcome::Declined("a lane command outside the native grammar".to_string())),
    }
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::overly_long_function,
        perfectionist::too_many_local_bindings,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
fn merge(args: &[OsString], argv: &[&str]) -> io::Result<Outcome> {
    let Some(options) = options::parse(&argv[2..]) else {
        return Ok(Outcome::Declined("outside the native lane merge grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if force_local_build(&root) {
        return Ok(Outcome::Declined("force_local_build may be set".to_string()));
    }
    let installer = match install::start(&root, argv, options.skip_install) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("lane merge installation: {error}"))),
    };
    let request =
        Request { operation: "merge", options: options.request(), to: None, verify_fresh: true };
    let mode = report::Mode { verbose: options.verbose, lane: true };
    let planned = if options.no_snap() {
        workspace_command::plan(&root, &request).map(|planned| (planned, None))
    } else {
        let mut no_snap = options.request();
        no_snap["noSnap"] = Value::Bool(true);
        no_snap
            .as_object_mut()
            .unwrap()
            .remove("message");
        let no_snap_request =
            Request { operation: "merge", options: no_snap, to: None, verify_fresh: true };
        std::thread::scope(|scope| {
            let preview = scope.spawn(|| workspace_command::plan_snapshot_preview(&root, &request));
            let materialized = workspace_command::plan_internal_no_snap(&root, &no_snap_request);
            let preview = preview
                .join()
                .map_err(|_| io::Error::other("merge snapshot preview thread panicked"))??;
            Ok::<_, io::Error>((preview, Some(materialized?)))
        })
    };
    let prepared = planned.and_then(|(planned, materialized)| {
        let report = report::format(&planned.plan["result"], mode, Chalk::detect(args))?;
        let progress = Progress::parse(planned.plan.get("progress"))?;
        Ok((planned, materialized, report, progress))
    });
    let (planned, materialized, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("lane merge: {error}"))),
    };
    if !options.no_snap() && planned.plan.get("needsSnap").is_some() {
        return install::execute_snapping(
            &root,
            args,
            install::Snapping {
                options: options.request(),
                message: options.message.as_deref(),
                mode,
                planned: &planned,
                progress: progress.as_ref(),
                installer,
                materialized,
            },
        );
    }
    install::execute(&root, args, planned, report, progress.as_ref(), installer)
}
