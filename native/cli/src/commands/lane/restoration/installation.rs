//! Each history partition completes its own actual install and outer compile on one Host.
use crate::commands::{
    add::ProjectedLinker,
    installation::Installer,
    status::environments::Environments,
    workspace_command::{self, Planned},
};
use bit_install::{HostInfo, output::Output};
use serde_json::{Value, json};
use std::{io, path::Path, sync::Arc};

pub(super) fn run(
    root: &Path,
    planned: &mut Planned,
    mut info: HostInfo,
    result: &mut Value,
    output: &Output,
) -> io::Result<Option<Environments>> {
    let ids = crate::commands::installation::component_ids(result)?;
    if ids.is_empty() || result["leftUnresolvedConflicts"] == true {
        return Ok(planned.take_environment());
    }
    let mut environment = planned
        .take_environment()
        .ok_or_else(|| io::Error::other("lane history installation provider session"))?;
    print!("{}", ProjectedLinker::project_installation_workspace(root, &mut environment)?);
    let host = Arc::new(
        environment
            .into_tracking_host()
            .ok_or_else(|| io::Error::other("lane history installation Host"))?,
    );
    info.file_id = workspace_command::file_id();
    let installed = Installer::from_host(Arc::clone(&host), info)
        .with_initialized_cache(planned.has_captured_components())
        .install(root, false, &ids);
    let succeeded = installed.is_ok();
    if let Err(error) = installed {
        output.failure(&format!("installation failed with the following error: {error}"));
        result["installationError"] = json!(error.to_string());
    }
    compile(&host, succeeded, result, output)?;
    let host =
        Arc::try_unwrap(host).map_err(|_| io::Error::other("lane history Host still borrowed"))?;
    Ok(Some(Environments::from_host(host).for_checkout()))
}

fn compile(
    host: &crate::host::Host,
    succeeded: bool,
    result: &mut Value,
    output: &Output,
) -> io::Result<()> {
    let compiled = host.call("switchCompile", &json!({"installationSucceeded":succeeded}));
    print!("{}", host.take_stdout());
    let compiled = compiled?;
    if let Some(error) = compiler_error(&compiled["error"])? {
        output.failure(&format!("compilation failed with the following error: {error}"));
        result["compilationError"] = json!(error);
    }
    Ok(())
}

fn compiler_error(value: &Value) -> io::Result<Option<String>> {
    match value {
        Value::Null => Ok(None),
        Value::String(error) => {
            let trimmed = error.trim();
            Ok((!trimmed.is_empty()).then(|| trimmed.to_owned()))
        }
        Value::Object(map) => Ok(map
            .get("message")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|msg| !msg.is_empty())
            .map(str::to_owned)),
        _ => Err(io::Error::other("lane history compiler receipt")),
    }
}
