//! Read the limited lane projection returned by an HTTP scope's GraphQL API.
use super::{configured_remote, read_json_file};
use crate::workspace::engine::invalid;
use bit_client_transfer::{GlobalConfig, http::Network, remotes::Remote};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    remote_scope: String,
    #[serde(default)]
    name: Option<String>,
    global_remotes_file: PathBuf,
    global_config_dir: PathBuf,
    bit_version: String,
}

pub(in crate::workspace::engine) fn read(request: &Request) -> io::Result<(usize, Value)> {
    super::super::super::path(&request.root)?;
    let Remote::Http(url) = configured_remote(
        &request.root,
        &request.remote_scope,
        Some(&request.global_remotes_file),
    )?
    else {
        return Err(invalid("remote lane HTTP request for file scope"));
    };
    let scope = read_json_file(&crate::scope_path(&request.root).join("scope.json"))?;
    let local = scope["name"].as_str().ok_or_else(|| invalid("remote lane local scope"))?;
    let config = request.global_config_dir.join("config.json");
    let global: GlobalConfig = match read_json_file(&config) {
        Ok(value) => serde_json::from_value(value).map_err(io::Error::other)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => GlobalConfig::new(),
        Err(error) => return Err(error),
    };
    let network = Network::new(&global, &request.bit_version, Some(local), None)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let id = request.name
        .as_ref()
        .map(|name| format!("{}/{name}", request.remote_scope));
    let lanes = runtime.block_on(network.list_lanes(&url, id.as_deref()))?;
    Ok((lanes.len(), json!({"lanes":lanes})))
}
