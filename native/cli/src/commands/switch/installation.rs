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
    print!(
        "{}",
        ProjectedLinker::project_installation_workspace_with_engine(
            root,
            &mut environment,
            planned.engine_mut(),
        )?,
    );
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
    if let Some(error) = compiler_error(&compiled["error"])? {
        output.failure(&format!("compilation failed with the following error: {error}"));
        reports.push(compilation_error(chalk, &error));
    }
    Ok(reports)
}

fn compiler_error(value: &serde_json::Value) -> io::Result<Option<String>> {
    if value.is_null() {
        return Ok(None);
    }
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        return Ok((!trimmed.is_empty()).then(|| trimmed.to_owned()));
    }
    if let Some(message) = value
        .as_object()
        .and_then(|object| object.get("message"))
        .and_then(serde_json::Value::as_str)
    {
        let trimmed = message.trim();
        return Ok((!trimmed.is_empty()).then(|| trimmed.to_owned()));
    }
    Err(io::Error::other("switch compiler receipt"))
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
