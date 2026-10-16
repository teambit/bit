//! Native `bit lane merge <lane> [pattern] -x`: a merge workspace command
//! (`workspace_command`) with the lane options, the lane step, and the whole
//! merge report; and `bit lane list` (`list`). Other `bit lane` commands are
//! left to the Node.js CLI.

mod alias;
mod create;
mod current;
mod history;
mod import;
mod list;
mod manage;
mod options;
mod remove;
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
        Some("create") => create::run(args, &argv[2..]),
        Some("alias") => alias::run(args, &argv[2..]),
        Some("rename") => manage::rename(args, &argv[2..]),
        Some("change-scope") => manage::change_scope(args, &argv[2..]),
        Some("history") => history::run(args, &argv[2..]),
        Some("show") => show::show(args, &argv[2..]),
        Some("import") => import::run(args, &argv),
        Some("remove") => remove::run(args, &argv[2..]),
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
        perfectionist::excessive_cognitive_complexity,
        perfectionist::overly_long_function,
        perfectionist::too_many_local_bindings,
        reason = "The lane merge CLI coordinates preview, materialization, and direct removal snapshots"
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
    if planned.plan["result"]["removedComponents"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty())
        && installer.is_none()
    {
        let (direct, direct_report, direct_progress) =
            match workspace_command::plan(&root, &request)
                .and_then(|direct| {
                    let report = report::format(&direct.plan["result"], mode, Chalk::detect(args))?;
                    let progress = Progress::parse(direct.plan.get("progress"))?;
                    Ok((direct, report, progress))
                }) {
                Ok(direct) => direct,
                Err(error) => {
                    return Ok(Outcome::Declined(format!("removed lane merge: {error}")));
                }
            };
        return workspace_command::execute(
            &root,
            args,
            "merge",
            direct,
            &direct_report,
            |output| {
                if let Some(progress) = &direct_progress {
                    progress.render_merge(output);
                }
            },
        );
    }
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
