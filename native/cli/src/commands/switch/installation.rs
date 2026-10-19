//! `ComponentWriter` finalization preserves the same providers, bitmap and two compile phases.
use crate::commands::{
    add::ProjectedLinker,
    color::Chalk,
    installation::Installer,
    workspace_command::{self, Planned, format::Formatter},
};
use bit_install::{HostInfo, output::Output};
use serde_json::json;
use std::{io, path::Path, sync::Arc};

pub(super) fn run(
    root: &Path,
    planned: &mut Planned,
    mut info: HostInfo,
    ids: &[String],
    output: &Output,
    chalk: Chalk,
) -> io::Result<Vec<String>> {
    let mut environment = planned
        .take_environment()
        .ok_or_else(|| io::Error::other("switch installation provider session"))?;
    print!("{}", ProjectedLinker::project_installation_workspace(root, &mut environment)?);
    let host = environment
        .into_tracking_host()
        .ok_or_else(|| io::Error::other("switch installation Host"))?;
    let host = Arc::new(host);
    info.file_id = workspace_command::file_id();
    let mut reports = Vec::new();
    let installed = Installer::from_host(Arc::clone(&host), info)
        .with_initialized_cache(planned.has_captured_components())
        .install(root, false, ids);
    let installation_succeeded = installed.is_ok();
    if let Err(error) = installed {
        output.failure(&format!("installation failed with the following error: {error}"));
        reports.push(crate::commands::installation::error_report(chalk, &error.to_string()));
    }
    let compiled =
        host.call("switchCompile", &json!({"installationSucceeded":installation_succeeded}));
    print!("{}", host.take_stdout());
    let compiled = compiled?;
    if let Some(error) = compiled["error"].as_str() {
        output.failure(&format!("compilation failed with the following error: {error}"));
        reports.push(compilation_error(chalk, error));
    } else if !compiled["error"].is_null() {
        return Err(io::Error::other("switch compiler receipt"));
    }
    Ok(reports)
}

fn compilation_error(chalk: Chalk, message: &str) -> String {
    let formatter = Formatter::new(chalk);
    format!(
        "{} {}\nThe following error was thrown by the compiler\n{}\nPlease fix the issue and run \"bit compile\"",
        formatter.error_symbol(),
        formatter.title("Compilation Error"),
        chalk.red(message),
    )
}
