//! Native `bit snap [component-pattern]`: the engine plans and writes the
//! snaps (`workspace_command::resolve`), with the snap options and report.

mod options;

use super::{
    color::Chalk,
    merge::force_local_build,
    workspace_command::{self, progress::Progress, resolve, versions},
};
use crate::{commands::Command, native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "snap", aliases: &[], run };

/// The warning `bit snap` prints without `--message`.
const MESSAGE_WARNING: &str = "--message will be mandatory in the next few releases. make sure to add a message with your snap, will be displayed in the version history";

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native snap grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if force_local_build(&root) {
        return Ok(Outcome::Declined("force_local_build may be set".to_string()));
    }
    let request = resolve::ResolveRequest {
        kind: resolve::Kind::Snap,
        options: options.request(),
        selection: resolve::Selection::Snap {
            pattern: options.pattern.as_deref(),
            unmerged: options.unmerged,
        },
    };
    let prepared = resolve::plan(&root, &request)
        .and_then(|planned| {
            let report =
                versions::format(&planned.plan["result"], Chalk::detect(args), &versions::SNAP)?;
            let progress = Progress::parse_snap(planned.plan.get("progress"))?;
            Ok((planned, report, progress))
        });
    let (planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("snap: {error}"))),
    };
    let warn = options.message.is_none();
    workspace_command::execute(&root, args, "snap", planned, &report, |output| {
        if warn {
            output.warning(MESSAGE_WARNING);
        }
        if let Some(progress) = &progress {
            progress.render_merge(output);
        }
    })
}
