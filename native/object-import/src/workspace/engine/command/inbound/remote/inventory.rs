//! Read-only public remote list and latest-version inventory. The request
//! carries identities only; model and Version object bodies remain in Rust.
mod latest;
#[cfg(test)]
mod tests;

use super::{connection, file_list, invalid};
use crate::{read_budget::Budget, workspace::engine::response};
use bit_client_transfer::{
    GlobalConfig,
    http::Network,
    remotes::{Remote, Remotes},
};
use indexmap::IndexMap;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    env,
    fs::File,
    io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    #[serde(default)]
    root: Option<PathBuf>,
    #[serde(default)]
    home: Option<PathBuf>,
    #[serde(flatten)]
    selection: Selection,
    #[serde(default)]
    hosts: HashMap<String, String>,
    #[serde(flatten)]
    transport: super::super::Transport,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Selection {
    mode: String,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    namespaces: Option<String>,
    #[serde(default)]
    include_deleted: bool,
    #[serde(default)]
    ids: Vec<String>,
}

pub(in crate::workspace::engine) fn read(input: &Request) -> io::Result<(usize, Value)> {
    validate(input)?;
    let (remotes, network, global) = connection(input)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let outcome = runtime.block_on(async {
        match input.selection.mode.as_str() {
            "list" => list(input, &remotes, &network).await,
            "latestVersions" => {
                latest::versions(input, &remotes, &network, &global).await.map(|rows| (rows, false))
            }
            _ => Err(invalid("remote inventory mode")),
        }
    });
    let (rows, warning) = outcome.map_err(|error| {
        if bit_client_transfer::http::old_server_fallback(&error) {
            return response::with_progress(response::canonical(error.to_string()),
                json!({"warning":"error: the remote does not support the include-deleted flag yet, falling back to listing without deleted components"}));
        }
        error
    })?;
    let count = rows.len();
    let receipt = if input.selection.mode == "list" {
        json!({"components": rows, "oldServerWarning": warning})
    } else {
        json!({"ids": rows})
    };
    Ok((count, receipt))
}

fn validate(input: &Request) -> io::Result<()> {
    if input.transport.bit_version.trim().is_empty()
        || !input.transport.node_executable.is_absolute()
        || !input.transport.global_config_dir.is_absolute()
        || input.root
            .as_ref()
            .is_some_and(|path| !path.is_absolute())
        || input.home
            .as_ref()
            .is_some_and(|path| !path.is_absolute())
        || invalid_hosts(&input.hosts)
    {
        return Err(invalid("remote inventory paths"));
    }
    match input.selection.mode.as_str() {
        "list"
            if input.selection.ids.is_empty()
                && input.selection.scope.as_deref().is_some_and(valid_scope)
                && input.selection.namespaces
                    .as_ref()
                    .is_none_or(|value| value.len() <= 4096) =>
        {
            Ok(())
        }
        "latestVersions"
            if input.selection.scope.is_none()
                && input.selection.namespaces.is_none()
                && !input.selection.include_deleted
                && input.selection.ids.len() <= 4096 =>
        {
            Ok(())
        }
        _ => Err(invalid("remote inventory selection")),
    }
}

fn invalid_hosts(hosts: &HashMap<String, String>) -> bool {
    hosts.len() > 4096
        || hosts
            .iter()
            .any(|(scope, host)| {
                !valid_scope(scope) || host.len() > 4096 || Remote::from_host(host).is_err()
            })
}

fn valid_scope(scope: &str) -> bool {
    !scope.is_empty() && scope.len() <= 512 && !scope.contains('/') && !scope.contains("..")
}

fn connection(input: &Request) -> io::Result<(Remotes, Network, GlobalConfig)> {
    if let Some(root) = &input.root {
        let home = input.home
            .clone()
            .unwrap_or_else(|| {
                PathBuf::from(
                    env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                        .unwrap_or_default(),
                )
            });
        let (remotes, network, global, _) = connection::with_home(root, &input.transport, &home)?;
        return Ok((remotes, network, global));
    }
    let global = connection::global_config(&input.transport)?;
    let remotes = Remotes::load(&Value::Null, &input.transport.global_config_dir, &global)?;
    let network = Network::new(
        &global,
        &input.transport.bit_version,
        None,
        input.transport.token.as_deref(),
    )?;
    Ok((remotes, network, global))
}

async fn list(
    input: &Request,
    remotes: &Remotes,
    network: &Network,
) -> io::Result<(Vec<Value>, bool)> {
    let scope =
        input.selection.scope.as_deref().ok_or_else(|| invalid("remote inventory scope"))?;
    let remote = remote_for(input, scope, remotes, network).await?;
    match remote {
        Remote::File(path) => file_list(
            &path,
            scope,
            input.selection.namespaces.as_deref(),
            input.selection.include_deleted,
        )
        .map(|rows| (rows, false)),
        Remote::Http(url) => {
            network.inventory_with_warning(
                &url,
                input.selection.namespaces.as_deref(),
                input.selection.include_deleted,
            )
            .await
        }
    }
}

async fn remote_for(
    input: &Request,
    scope: &str,
    remotes: &Remotes,
    network: &Network,
) -> io::Result<Remote> {
    if let Some(remote) = remotes.configured(scope)? {
        return Ok(remote);
    }
    if let Some(host) = input.hosts.get(scope) {
        if !remotes.has_custom_resolver() {
            return Err(invalid("unexpected remote inventory host override"));
        }
        return Remote::from_host(host);
    }
    if remotes.has_custom_resolver() {
        return Err(invalid("remote inventory resolver callback needs retained host"));
    }
    remotes.resolve(scope, network).await
}

fn identity(id: &str) -> io::Result<(&str, &str)> {
    let (scope, rest) = id.split_once('/').ok_or_else(|| invalid("remote inventory id"))?;
    let name = rest.split_once('@').map_or(rest, |(name, _)| name);
    if !valid_scope(scope) || name.is_empty() || name.contains("..") || name.starts_with('/') {
        return Err(invalid("remote inventory id"));
    }
    Ok((scope, name))
}

fn scope_file(path: &Path, scope: &str) -> io::Result<()> {
    let value: Value =
        crate::parse_jsonc(&Budget::new(1024 * 1024).read(File::open(path.join("scope.json"))?)?)?;
    if value["name"] != scope {
        return Err(invalid("remote file scope identity"));
    }
    Ok(())
}

fn file_list(
    path: &Path,
    scope: &str,
    namespaces: Option<&str>,
    include_deleted: bool,
) -> io::Result<Vec<Value>> {
    scope_file(path, scope)?;
    let pattern = namespaces.map(|namespaces| file_list::matcher(scope, namespaces)).transpose()?;
    let mut seen = HashSet::new();
    let mut compressed = 0;
    let mut rows = Vec::new();
    for indexed in file_list::index(path)? {
        let (name, hash) = file_list::indexed(&indexed, scope, &mut seen)?;
        if pattern
            .as_ref()
            .is_some_and(|pattern| {
                pattern
                    .find(&format!("{scope}/{name}"))
                    .is_none()
            })
        {
            continue;
        }
        if let Some(row) = file_row(path, scope, &name, &hash, include_deleted, &mut compressed)? {
            rows.push(row);
        }
    }
    rows.sort_by(|left, right| {
        let left = left["id"]
            .as_str()
            .unwrap_or_default()
            .to_uppercase();
        let right = right["id"]
            .as_str()
            .unwrap_or_default()
            .to_uppercase();
        left.encode_utf16().cmp(right.encode_utf16())
    });
    Ok(rows)
}

fn file_row(
    path: &Path,
    scope: &str,
    name: &str,
    hash: &str,
    include_deleted: bool,
    compressed: &mut usize,
) -> io::Result<Option<Value>> {
    let model = file_list::object(path, hash, "Component", compressed)?;
    if model["scope"] != scope || model["name"] != name {
        return Err(invalid("remote file model identity"));
    }
    let Some(head) = model["head"].as_str() else { return Ok(None) };
    let version = file_list::object(path, head, "Version", compressed)?;
    crate::history_query::validate_version(&version)?;
    file_component(scope, name, &model, &version, include_deleted)
}

fn file_component(
    scope: &str,
    name: &str,
    model: &Value,
    version: &Value,
    include_deleted: bool,
) -> io::Result<Option<Value>> {
    let removed = file_list::extension(version, "teambit.component/remove", "removed");
    if removed && !include_deleted {
        return Ok(None);
    }
    let deprecated = model["deprecated"] == true
        || file_list::extension(version, "teambit.component/deprecation", "deprecate");
    let latest = latest_from_model(model)?;
    Ok(Some(json!({
        "id": format!("{scope}/{name}@{latest}"),
        "deprecated": deprecated,
        "removed": removed,
        "laneReadmeOf": lane_readme(version)?,
    })))
}

/// `ModelComponent.getHeadRegardlessOfLaneAsTagOrHash` searches the newest
/// ordinary tag first, then orphaned tags, before using the raw head.
fn latest_from_model(model: &Value) -> io::Result<String> {
    let head = model["head"].as_str().ok_or_else(|| invalid("remote file model head"))?;
    crate::merge_history::hash(head)?;
    for field in ["versions", "orphanedVersions"] {
        if let Some(versions) = model[field].as_object()
            && let Some((tag, _)) = versions
                .iter()
                .rev()
                .find(|(_, value)| value.as_str() == Some(head))
        {
            return Ok(tag.clone());
        }
    }
    Ok(head.to_owned())
}

fn lane_readme(version: &Value) -> io::Result<Vec<String>> {
    let Some(readme) = version["extensions"]
        .as_array()
        .and_then(|extensions| {
            extensions
                .iter()
                .find(|row| {
                    crate::workspace::engine::client_status::config::is_extension_aspect(
                        row,
                        "teambit.lanes/lanes",
                    )
                })
        })
        .map(|row| &row["config"]["readme"])
        .filter(|readme| !readme.is_null() && *readme != false)
    else {
        return Ok(Vec::new());
    };
    readme
        .as_object()
        .map(|row| row.keys().cloned().collect())
        .ok_or_else(|| invalid("remote file lane readme"))
}

fn file_latest(path: &Path, scope: &str, ids: &[String]) -> io::Result<Vec<String>> {
    scope_file(path, scope)?;
    let mut seen = HashSet::new();
    let mut index = IndexMap::new();
    for row in file_list::index(path)? {
        let (name, hash) = file_list::indexed(&row, scope, &mut seen)?;
        index.insert(name, hash);
    }
    let mut compressed = 0;
    ids.iter()
        .map(|id| {
            let (_, name) = identity(id)?;
            let hash = index.get(name).ok_or_else(|| invalid("remote component not found"))?;
            let model = file_list::object(path, hash, "Component", &mut compressed)?;
            if model["scope"] != scope || model["name"] != name {
                return Err(invalid("remote file model identity"));
            }
            let latest = latest_from_model(&model)?;
            Ok(format!("{scope}/{name}@{latest}"))
        })
        .collect()
}
