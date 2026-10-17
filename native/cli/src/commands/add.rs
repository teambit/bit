//! Native tracking: retain the projected bitmap until component links succeed.
mod cache;
mod cleanup;
mod dependencies;
mod diagnostics;
mod docs;
mod execution;
mod linking;
mod options;
mod output;
mod preparation;
mod projection;
mod remote;
mod report;

use super::{
    Command,
    color::Chalk,
    engine::Engine,
    status::{autosync::Startup, capture},
    workspace_command,
};
use crate::{native::Outcome, workspace};
use bit_object_import::component_tracking::Plan;
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "add", aliases: &["a"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("tracking arguments are not UTF-8".to_owned()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native tracking grammar".to_owned()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if diagnostics::ci() {
            return Ok(Outcome::Declined(
                "CI workspace diagnostics require the published stack".to_owned(),
            ));
        }
        return output::failure(
            &cwd,
            args,
            options.json,
            &Startup::default(),
            io::Error::other(
                "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)",
            ),
        );
    };
    if !root.join(".bitmap").try_exists()? {
        if diagnostics::ci() {
            return Ok(Outcome::Declined(
                "CI startup diagnostics require the published stack".to_owned(),
            ));
        }
        eprintln!("{}",Chalk::detect(args).red(r#"fatal: unable to load the workspace. workspace.jsonc or .bitmap or local-scope are missing. run "bit init" to generate the missing files"#));
        return Ok(Outcome::Exit(std::process::ExitCode::FAILURE));
    }
    run_workspace(&root, &cwd, args, &options)
}

fn run_workspace(
    root: &Path,
    cwd: &Path,
    args: &[OsString],
    options: &options::Options,
) -> io::Result<Outcome> {
    let mut startup = Startup::default();
    let prepared = preparation::prepare(root, cwd, options, &mut startup);
    let prepared = match prepared {
        Ok(prepared) => prepared,
        Err(error)
            if !startup.committed
                && diagnostics::ci()
                && error.kind() == io::ErrorKind::InvalidInput =>
        {
            return Ok(Outcome::Declined(format!(
                "CI tracking diagnostics require the published stack: {error}",
            )));
        }
        Err(error) if startup.committed || error.kind() == io::ErrorKind::InvalidInput => {
            return output::failure(root, args, options.json, &startup, error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("tracking: {error}"))),
    };
    workspace_command::checkout_lifecycle::before(&startup)?;
    let execute = |output: &bit_install::output::Output| {
        if !prepared.plan.components().is_empty() {
            output.status(&format!("loading {} component(s)", prepared.plan.components().len()));
        }
        workspace_command::checkout_lifecycle::loaded(&startup);
        execution::run(root, prepared, options.json, Chalk::detect(args), output)
    };
    if options.json {
        workspace_command::execute_json(root, args, "add", execute)
    } else {
        workspace_command::execute_then(root, args, "add", execute)
    }
}

struct Prepared {
    plan: Plan,
    projection: projection::Projection,
    capture: Option<capture::Capture>,
    engine: Engine,
}
