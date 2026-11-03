//! Each history partition completes its own actual install and outer compile on one Host.
//!
//! [`run`] ([`compile`], [`compiler_error`]) coordinates [`ProjectedLinker`], [`Installer`], and [`Environments`] across [`Planned`] checkout partitions.
use crate::commands::{
    add::ProjectedLinker,
    installation::Installer,
    status::environments::Environments,
    workspace_command::{self, Planned},
};
use bit_install::{HostInfo, output::Output};
use serde_json::{Value, json};
use std::{io, path::Path, sync::Arc};

/// Runs package installation ([`Installer`]) and compilation ([`compile`]) for a completed [`Planned`] lane-history restoration partition.
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
        let message = error.to_string();
        let trimmed = message.trim();
        output.failure(&format!("installation failed with the following error: {trimmed}"));
        result["installationError"] = json!(trimmed);
    }
    compile(&host, succeeded, result, output)?;
    let host =
        Arc::try_unwrap(host).map_err(|_| io::Error::other("lane history Host still borrowed"))?;
    Ok(Some(Environments::from_host(host).for_checkout()))
}

/// Invokes `switchCompile` on `host` after package installation and records any compiler error on `result`.
#[inline]
fn compile(
    host: &crate::host::Host,
    succeeded: bool,
    result: &mut Value,
    output: &Output,
) -> io::Result<()> {
    let compiled = host.call("switchCompile", &json!({"installationSucceeded":succeeded}));
    let stdout = host.take_stdout();
    if !stdout.is_empty() {
        print!("{stdout}");
    }
    let compiled = compiled?;
    if let Some(error) = compiler_error(&compiled["error"])? {
        output.failure(&format!("compilation failed with the following error: {error}"));
        result["compilationError"] = json!(error);
    }
    Ok(())
}

/// Extracts an optional compiler error message from a `switchCompile` receipt [`Value`].
#[inline]
fn compiler_error(value: &Value) -> io::Result<Option<&str>> {
    match value {
        Value::Null => Ok(None),
        Value::String(error) => {
            let trimmed = error.trim();
            Ok((!trimmed.is_empty()).then_some(trimmed))
        }
        Value::Object(map) if map.is_empty() => Ok(None),
        Value::Object(map) => map
            .get("message")
            .or_else(|| map.get("msg"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|msg| !msg.is_empty())
            .map(Some)
            .ok_or_else(|| io::Error::other("lane history compiler receipt")),
        _ => Err(io::Error::other("lane history compiler receipt")),
    }
}
