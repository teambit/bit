//! Read the limited lane projection returned by an HTTP scope's GraphQL API.
use super::{read_json_file, remote_for_lane, scope_directory, validate_bare_scope};
use crate::workspace::engine::invalid;
use bit_client_transfer::{GlobalConfig, http::Network, remotes::Remote};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    #[serde(default)]
    bare_scope: bool,
    remote_scope: String,
    #[serde(default)]
    name: Option<String>,
    global_remotes_file: PathBuf,
    global_config_dir: PathBuf,
    bit_version: String,
    #[serde(default)]
    remote_host: Option<String>,
}

pub(in crate::workspace::engine) fn read(request: &Request) -> io::Result<(usize, Value)> {
    super::super::super::path(&request.root)?;
    if request.bare_scope {
        validate_bare_scope(&request.root)?;
    }
    let Remote::Http(url) = remote_for_lane(
        &request.root,
        request.bare_scope,
        &request.remote_scope,
        Some(&request.global_remotes_file),
        request.remote_host.as_deref(),
    )?
    else {
        return Err(invalid("remote lane HTTP request for file scope"));
    };
    let scope =
        read_json_file(&scope_directory(&request.root, request.bare_scope).join("scope.json"))?;
    let local = scope["name"].as_str().ok_or_else(|| invalid("remote lane local scope"))?;
    let global: GlobalConfig = serde_json::from_value(bit_workspace_config::read_global_config(
        &request.global_config_dir,
    )?)
    .map_err(io::Error::other)?;
    let global = if request.bare_scope {
        bit_client_transfer::config::effective(
            global,
            &scope["config"],
            &Value::Object(serde_json::Map::new()),
        )
    } else {
        global
    };
    let network = Network::new(&global, &request.bit_version, Some(local), None)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let id = request.name
        .as_ref()
        .map(|name| format!("{}/{name}", request.remote_scope));
    let lanes = runtime.block_on(network.list_lanes(&url, id.as_deref()))?;
    Ok((lanes.len(), json!({"lanes":lanes})))
}
