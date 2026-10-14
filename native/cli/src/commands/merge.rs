//! Native `bit merge [component-pattern] -x`, a workspace command
//! (`workspace_command`) with the merge options and report, and
//! `bit merge --resolve` (`resolve`). The `forceLocalBuild` config is left
//! to the Node.js CLI.

pub(super) mod report;

pub(super) mod install;
mod options;
mod resolve;

use super::{
    color::Chalk,
    status::cache::cache_root,
    workspace_command::{self, Request, progress::Progress},
};
use crate::{commands::Command, native::Outcome, workspace};
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "merge", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    if let Some(resolve) = resolve::parse(&argv[1..]) {
        return resolve::run(args, &resolve);
    }
    if let Some(abort) = super::recovery::parse_component(&argv[1..]) {
        return super::recovery::run(args, &abort);
    }
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native merge grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if force_local_build(&root) {
        return Ok(Outcome::Declined("force_local_build may be set".to_string()));
    }
    let installer = match install::start(&root, &argv, options.skip_install) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("merge installation: {error}"))),
    };
    let request =
        Request { operation: "merge", options: options.request(), to: None, verify_fresh: true };
    let prepared = workspace_command::plan(&root, &request)
        .and_then(|planned| {
            let mode = report::Mode { verbose: options.verbose, lane: false };
            let report = report::format(&planned.plan["result"], mode, Chalk::detect(args))?;
            let progress = Progress::parse(planned.plan.get("progress"))?;
            Ok((planned, report, progress))
        });
    let (planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("merge: {error}"))),
    };
    install::execute(&root, args, planned, report, progress.as_ref(), installer)
}

/// `getConfigBoolean('force_local_build')` may be true: any mention declines.
pub(super) fn force_local_build(root: &Path) -> bool {
    let files = [
        root.join("workspace.jsonc"),
        root.join(".bit").join("scope.json"),
        cache_root().join("config").join("config.json"),
    ];
    env::var_os("BIT_CONFIG_FORCE_LOCAL_BUILD").is_some()
        || files
            .iter()
            .any(|file| {
                fs::read_to_string(file).is_ok_and(|text| text.contains("force_local_build"))
            })
}
