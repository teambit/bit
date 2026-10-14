//! The ordinary merge install follows native no-snap materialization.

use crate::{
    commands::{
        installation::Installer,
        workspace_command::{self, Planned, progress::Progress, results::Report},
    },
    native::Outcome,
};
use bit_install::output::Output;
use std::{ffi::OsString, io, path::Path};

pub(in crate::commands) fn start(
    root: &Path,
    argv: &[&str],
    skip: bool,
) -> io::Result<Option<Installer>> {
    if skip { Ok(None) } else { Installer::start(root, argv).map(Some) }
}

pub(in crate::commands) fn execute(
    root: &Path,
    args: &[OsString],
    planned: Planned,
    report: Report,
    progress: Option<&Progress>,
    installer: Option<Installer>,
) -> io::Result<Outcome> {
    let Some(installer) = installer else {
        return workspace_command::execute(root, args, "merge", planned, &report, |output| {
            render_progress(output, progress);
        });
    };
    let result = &planned.plan["result"];
    if planned.plan.get("needsSnap").is_some() || result["mergeSnapResults"].is_object() {
        return Ok(Outcome::Declined("merge installation precedes snapping".to_string()));
    }
    let conflicts = result["leftUnresolvedConflicts"] == true;
    workspace_command::execute_then(root, args, "merge", |output| {
        render_progress(output, progress);
        let mut planned = planned;
        workspace_command::commit(&mut planned, root)?;
        if !conflicts && let Err(error) = installer.install_merge(root) {
            output.failure(&format!(
                "failed installing packages, see the log for full stacktrace. error: {error}",
            ));
        }
        Ok(report)
    })
}

fn render_progress(output: &Output, progress: Option<&Progress>) {
    if let Some(progress) = progress {
        progress.render_merge(output);
    }
}
