//! Confirmation precedes restoration and any configured component callbacks.
use super::{
    Chalk, Engine, Installer, Kind, Options, Outcome, Prepared, Startup, Value, array, execute,
    failure, format_result, installation_session, prepare_request, workspace_command,
};
use crate::commands::install::confirm;
use std::{ffi::OsString, io, path::Path};

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

fn prompt(preview: &Value, chalk: Chalk) -> io::Result<String> {
    let directories = array(preview.get("restoredItems"), "recovery restoration items")?
        .iter()
        .filter_map(Value::as_str)
        .find_map(|item| item.strip_prefix("deleted components directories: "))
        .map(str::trim)
        .filter(|dirs| !dirs.is_empty());
    let directories = directories.map_or_else(String::new, |dirs| {
        format!("\nThe following directories introduced by the merge will be deleted: {dirs}")
    });
    Ok(format!(
        "Code changes that were done since the last lane-merge will be lost.{directories}\nThe .bitmap and workspace.jsonc files will be restored to the state before the merge.\nThis action is irreversible.\n{}",
        chalk.bold("Do you want to continue? [yes(y)/no(n)]"),
    ))
}
