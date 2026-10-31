//! Read the limited lane projection returned by an HTTP scope's GraphQL API.
use crate::{read_budget::Budget, workspace::engine::invalid};
use bit_client_transfer::{GlobalConfig, http::Network, remotes::Remote};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::File,
    io,
    path::{Path, PathBuf},
};

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
    validate_bit_version(&request.bit_version)?;
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

pub(super) fn configured_remote(
    root: &Path,
    scope: &str,
    global_remotes_file: Option<&Path>,
) -> io::Result<Remote> {
    if scope.is_empty() || scope.contains('/') || scope == "." || scope == ".." {
        return Err(invalid("list remote scope"));
    }
    let local = read_json_file(&crate::scope_path(root).join("scope.json"))?;
    let host = local["remotes"][scope]
        .as_str()
        .map(str::to_owned)
        .or_else(|| {
            let path = global_remotes_file?;
            let global = read_json_file(path).ok()?;
            global[scope].as_str().map(str::to_owned)
        })
        .ok_or_else(|| invalid("list unconfigured remote"))?;
    Remote::from_host(&host)
}

pub(super) fn scope_directory(root: &Path, bare: bool) -> PathBuf {
    if bare { root.to_owned() } else { crate::scope_path(root) }
}

pub(super) fn validate_bare_scope(root: &Path) -> io::Result<String> {
    let scope = read_json_file(&root.join("scope.json"))?;
    let name = scope["name"]
        .as_str()
        .filter(|name| !name.is_empty() && !name.contains('/'))
        .ok_or_else(|| invalid("bare lane scope name"))?;
    if !root.join("objects").is_dir() {
        return Err(invalid("bare lane scope objects"));
    }
    read_local_bare_index(root)?;
    Ok(name.to_owned())
}

pub(super) fn read_local_bare_index(root: &Path) -> io::Result<Value> {
    match read_bare_index(root) {
        Ok(index) => Ok(index),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Ok(json!({"components":[],"lanes":[]}))
        }
        Err(error) => Err(error),
    }
}

pub(super) fn remote_for_lane(
    root: &Path,
    bare: bool,
    scope: &str,
    global_remotes_file: Option<&Path>,
    remote_host: Option<&str>,
) -> io::Result<Remote> {
    if scope.is_empty() || scope.contains('/') || scope == "." || scope == ".." {
        return Err(invalid("bare lane remote scope"));
    }
    if let Some(host) = remote_host {
        return Remote::from_host(host);
    }
    if !bare {
        return configured_remote(root, scope, global_remotes_file);
    }
    let host = global_remotes_file
        .and_then(|path| read_json_file(path).ok())
        .and_then(|global| global[scope].as_str().map(str::to_owned))
        .ok_or_else(|| invalid("bare lane unconfigured remote"))?;
    Remote::from_host(&host)
}

fn read_bare_index(root: &Path) -> io::Result<Value> {
    let index = read_json_file(&root.join("index.json"))?;
    if !index.is_array() && (!index["lanes"].is_array() || !index["components"].is_array()) {
        return Err(invalid("list remote index"));
    }
    Ok(index)
}

pub(super) fn read_json_file(path: &Path) -> io::Result<Value> {
    crate::parse_jsonc(&Budget::new(4 * 1024 * 1024).read(File::open(path)?)?)
}

fn validate_bit_version(bit_version: &str) -> io::Result<()> {
    if bit_version.trim().is_empty() {
        return Err(invalid("remote lane bit version is empty"));
    }
    Ok(())
}
