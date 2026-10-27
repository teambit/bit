//! Configured HTTP actions and native file pending-directory plans; preparation performs no remote requests.
mod errors;
mod file;
mod startup;

use super::workspace_command::{self, NodeCli, results::Report};
use crate::{native::Outcome, workspace};
use bit_client_transfer::{
    GlobalConfig,
    http::Network,
    remotes::{Remote, Remotes},
};
use bit_workspace_config::{global_config_dir, parse_jsonc, read_global_config};
use serde_json::Value;
use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Plan {
    root: PathBuf,
    workspace: bool,
    target: Target,
    pub(super) concurrency: usize,
}

enum Target {
    Http { url: String, network: Network },
    File(PathBuf),
}

impl Plan {
    pub(super) async fn action(&self, name: &str, payload: &Value) -> io::Result<Value> {
        match &self.target {
            Target::Http { url, network } => {
                network.action(url, name, payload).await.map_err(errors::format)
            }
            Target::File(scope) => {
                let scope = scope.clone();
                let name = name.to_owned();
                let payload = payload.clone();
                tokio::task::spawn_blocking(move || file::action(&scope, &name, &payload))
                    .await
                    .map_err(io::Error::other)?
            }
        }
    }

    pub(super) fn execute(
        &self,
        args: &[OsString],
        command: &str,
        work: impl FnOnce(&bit_install::output::Output) -> io::Result<Report>,
    ) -> io::Result<Outcome> {
        if self.workspace {
            workspace_command::execute_then(&self.root, args, command, work)
        } else {
            workspace_command::execute_then_scope(&self.root, args, command, work)
        }
    }
}

pub(super) fn prepare(
    cwd: &Path,
    remote: &str,
    load_workspace: bool,
    pending_deletion: bool,
) -> io::Result<Option<Plan>> {
    let workspace = workspace::root(cwd);
    let scope = workspace
        .as_ref()
        .map_or_else(
            || {
                cwd.ancestors()
                    .find(|path| path.join("scope.json").is_file())
                    .map(Path::to_path_buf)
            },
            |root| Some(workspace::scope_path(root)),
        );
    let Some(scope) = scope else { return Ok(None) };
    let scope_json: Value = serde_json::from_slice(&fs::read(scope.join("scope.json"))?)?;
    let config_dir = global_config_dir();
    let global: GlobalConfig = serde_json::from_value(read_global_config(&config_dir)?)?;
    let workspace_json = workspace
        .as_ref()
        .map(|root| parse_jsonc(&fs::read(root.join("workspace.jsonc"))?))
        .transpose()?
        .unwrap_or(Value::Null);
    if !startup::supported(workspace.as_deref(), &scope, &workspace_json, load_workspace)? {
        return Ok(None);
    }
    let global = bit_client_transfer::config::effective(
        global,
        &scope_json["config"],
        &Value::Object(bit_workspace_config::workspace_values(&workspace_json)),
    );
    let remotes = Remotes::load(&scope_json, &config_dir, &global)?;
    let Some(remote) = remotes.configured(remote)? else { return Ok(None) };
    let Some(target) = target(remote, &global, scope_json["name"].as_str(), pending_deletion)?
    else {
        return Ok(None);
    };
    Ok(Some(Plan {
        root: workspace.clone().unwrap_or(scope),
        workspace: workspace.is_some(),
        target,
        concurrency: bit_client_transfer::fetch::concurrency(&global),
    }))
}

fn target(
    remote: Remote,
    global: &GlobalConfig,
    name: Option<&str>,
    pending_deletion: bool,
) -> io::Result<Option<Target>> {
    match remote {
        Remote::File(path) if pending_deletion => Ok(file::prepare(&path)?.map(Target::File)),
        Remote::File(_) => Ok(None),
        Remote::Http(url) => {
            let version = NodeCli::find()?.version;
            let network = Network::new(global, &version, name, None)?;
            Ok(Some(Target::Http { url, network }))
        }
    }
}
