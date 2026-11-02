//! Confirmation precedes restoration and any configured component callbacks.
//!
//! [`run`] and [`prompt`] confirm with [`confirm`] before executing [`Prepared`] recovery and [`installation_session`] for [`Options`] and [`Kind`].
use super::{
    Chalk, Engine, Installer, Kind, Options, Outcome, Prepared, Startup, Value, array, execute,
    failure, format_result, installation_session, prepare_request, workspace_command,
};
use crate::commands::install::confirm;
use std::{ffi::OsString, io, path::Path};

/// Prompts for interactive confirmation via [`confirm`] and runs the merge-abort recovery plan.
pub(super) fn run(
    root: &Path,
    args: &[OsString],
    options: &Options,
    installer: Option<Installer>,
) -> io::Result<Outcome> {
    let mut engine = Engine::new()?;
    let preview: Value =
        engine.request(&prepare_request(root, &workspace_command::home(), options)?)?;
    let chalk = Chalk::detect(args);
    let prompt = prompt(&preview, chalk)?;
    workspace_command::execute_then(root, args, "merge-abort", |output| {
        output.stop();
        if !confirm(&prompt)? {
            return Err(io::Error::other("operation aborted"));
        }
        let (environment, installation) = installation_session(installer)?;
        let mut startup = Startup::default();
        let prepared = Prepared::plan(root, options, &mut startup, environment);
        workspace_command::checkout_lifecycle::before(&startup)?;
        workspace_command::checkout_lifecycle::loaded(&startup);
        let report = match prepared {
            Ok(prepared) => execute(root, args, output, prepared, installation)?,
            Err(error) => match failure::result(&error) {
                Some(result) => format_result(result, Kind::Lane, chalk)?,
                None => return Err(error),
            },
        };
        crate::commands::status::cleanup_temporary(root)?;
        Ok(report)
    })
}

/// Formats the interactive confirmation prompt for `bit lane merge-abort` from `preview` with [`Chalk`].
#[inline]
fn prompt(preview: &Value, chalk: Chalk) -> io::Result<String> {
    let items = array(preview.get("restoredItems"), "recovery restoration items")?;
    let mut deleted_dirs = None;
    for item in items {
        let trimmed = super::text(Some(item))?.trim();
        if deleted_dirs.is_none()
            && let Some(dirs) = trimmed
                .strip_prefix("deleted components directories:")
                .map(str::trim)
                .filter(|dirs| !dirs.is_empty())
        {
            deleted_dirs = Some(dirs);
        }
    }
    let directories = deleted_dirs.map_or_else(String::new, |dirs| {
        format!("\nThe following directories introduced by the merge will be deleted: {dirs}")
    });
    Ok(format!(
        "Code changes that were done since the last lane-merge will be lost.{directories}\nThe .bitmap and workspace.jsonc files will be restored to the state before the merge.\nThis action is irreversible.\n{}",
        chalk.bold("Do you want to continue? [yes(y)/no(n)]"),
    ))
}
