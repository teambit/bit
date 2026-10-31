//! Bounded scope acquisition and listing across HTTP and file remotes.
pub(in crate::workspace::engine) mod file_list;
pub(in crate::workspace::engine) mod inventory;
pub(in crate::workspace::engine::command) use history::{history_remote, history_remote_at};
mod connection;
mod history;
mod lane_list;
mod list_order;
mod missing;
#[cfg(test)]
mod tests;
use super::{List, Prepare, RemoteLog, Target, config, identity, invalid};
use crate::{
    command_import::{VirtualRemote, lane},
    workspace::engine::status_models::component_log,
};
use bit_client_transfer::{
    fetch::{self, FetchOptions},
    http::{Listed, Network},
    remotes::{Remote, Remotes},
    tar::ObjectItem,
};
use connection::{connect, global_config};
use futures_util::{StreamExt, TryStreamExt, stream};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    io,
    path::Path,
};

/// The compressed bytes one import may retain until publication: one archive's limit.
const MAX_INBOUND_BYTES: usize = bit_client_transfer::tar::MAX_ARCHIVE_BYTES;
/// The objects retained from one remote scope.
const MAX_INBOUND_OBJECTS: usize = 16384;

pub(super) fn recovery_connection(
    root: &Path,
    home: &Path,
    transport: &super::Transport,
) -> io::Result<(Remotes, Network)> {
    let (remotes, network, _, _) = connection::with_home(root, transport, home)?;
    Ok((remotes, network))
}

/// Retain an HTTP lane and its component closure before the import owner
/// publishes anything. File remotes continue through the deferred importer.
pub(super) fn lane_objects(
    input: &Prepare,
    id: &lane::Id,
) -> io::Result<Option<(VirtualRemote, String)>> {
    id.validate()?;
    let (remotes, network, _, _) =
        connection::with_home(&input.root, &input.transport, &input.home)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    runtime.block_on(async {
        let Remote::Http(url) = remotes.resolve(&id.scope, &network).await? else {
            return Ok(None);
        };
        let (items, hash) = fetch_lane(
            &network,
            &url,
            id,
            input.options.all_history,
            input.options.dependencies.fetch_deps,
        )
        .await?;
        let (mut remotes, _) =
            collect((Vec::new(), 0), &input.root, id.scope.clone(), Some(items))?;
        let remote = remotes.pop().ok_or_else(|| invalid("inbound lane remote"))?;
        Ok(Some((remote, hash)))
    })
}

/// `Lister.remoteList` preserves transport order unless fork file-scope ordering is requested.
pub(super) fn list(input: &List) -> io::Result<Vec<(String, Vec<Listed>)>> {
    let (remotes, network, _, _) = connect(&input.root, &input.transport)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    runtime.block_on(async {
        let lane_rows = listed_lane(input, &remotes, &network).await?;
        let mut lists = Vec::with_capacity(input.patterns.len());
        for pattern in &input.patterns {
            lists.push(
                list_pattern(
                    pattern,
                    input.lane_only,
                    &lane_rows,
                    &remotes,
                    &network,
                    input.fork_order,
                )
                .await?,
            );
        }
        Ok(lists)
    })
}

async fn listed_lane(
    input: &List,
    remotes: &Remotes,
    network: &Network,
) -> io::Result<Vec<Listed>> {
    let Some(id) = active_lane(&input.root)? else {
        if input.lane_only {
            return Err(invalid("inbound lane-only needs an active lane"));
        }
        return Ok(Vec::new());
    };
    match remotes.resolve(&id.scope, network).await? {
        Remote::File(path) => file_list::lane(&path, &id),
        Remote::Http(url) => http_lane(network, &url, &id).await,
    }
}

async fn http_lane(network: &Network, url: &str, id: &lane::Id) -> io::Result<Vec<Listed>> {
    let lane_id = format!("{}/{}", id.scope, id.name);
    let items =
        network.fetch_bounded(url, &[lane_id], &FetchOptions::lanes(), MAX_INBOUND_BYTES).await?;
    let (_, entries) = remote_lane(id, &items)?;
    lane_list::visible(entries)
}

async fn list_pattern(
    pattern: &str,
    lane_only: bool,
    lane_rows: &[Listed],
    remotes: &Remotes,
    network: &Network,
    fork_order: bool,
) -> io::Result<(String, Vec<Listed>)> {
    let (scope, namespaces) = pattern
        .split_once('/')
        .filter(|(scope, _)| !scope.is_empty())
        .ok_or_else(|| invalid("inbound list pattern"))?;
    let matcher = file_list::matcher(scope, namespaces)?;
    let mut listed = lane_rows
        .iter()
        .filter(|entry| {
            matcher
                .find(&format!("{}/{}", entry.scope, entry.name))
                .is_some()
        })
        .cloned()
        .collect::<Vec<_>>();
    if !lane_only {
        let remote = remotes.resolve(scope, network).await?;
        let main = list_order::main(&remote, scope, namespaces, network, fork_order).await?;
        let mut seen = listed
            .iter()
            .map(|entry| format!("{}/{}", entry.scope, entry.name))
            .collect::<std::collections::HashSet<_>>();
        listed.extend(
            main.into_iter()
                .filter(|entry| seen.insert(format!("{}/{}", entry.scope, entry.name))),
        );
    }
    Ok((pattern.to_owned(), listed))
}

pub(super) fn active_lane(root: &Path) -> io::Result<Option<lane::Id>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let Some(row) = bitmap
        .get("_bit_lane")
        .filter(|val| !val.is_null())
    else {
        return Ok(None);
    };
    let (scope, name) = if let Some(raw) = row["id"].as_str() {
        let (scope, name) = raw.split_once('/').unwrap_or(("", raw));
        (scope.to_owned(), name.to_owned())
    } else {
        let scope = row["id"]["scope"]
            .as_str()
            .or_else(|| row["scope"].as_str())
            .unwrap_or_default();
        let name = row["id"]["name"]
            .as_str()
            .or_else(|| row["name"].as_str())
            .unwrap_or_default();
        (scope.to_owned(), name.to_owned())
    };
    if name.is_empty() || name == "main" {
        return Ok(None);
    }
    let id = lane::Id { scope, name };
    id.validate()?;
    Ok(Some(id))
}

pub(super) fn log(input: &RemoteLog) -> io::Result<(usize, Value)> {
    let (remotes, network) = if let Some(root) = &input.root {
        let (remotes, network, _, _) = connect(root, &input.transport)?;
        (remotes, network)
    } else {
        let global = global_config(&input.transport)?;
        let remotes = Remotes::load(&Value::Null, &input.transport.global_config_dir, &global)?;
        let network = Network::new(
            &global,
            &input.transport.bit_version,
            None,
            input.transport.token.as_deref(),
        )?;
        (remotes, network)
    };
    let (scope, name) =
        input.identity.split_once('/').ok_or_else(|| invalid("remote log identity"))?;
    if scope.is_empty() || name.is_empty() || name.starts_with('/') || name.contains("..") {
        return Err(invalid("remote log identity"));
    }
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let (rows, parents_available): (Vec<Value>, bool) = runtime.block_on(async {
        match remotes.resolve(scope, &network).await? {
            Remote::Http(url) => {
                Ok::<_, io::Error>((network.log(&url, &input.identity).await?, false))
            }
            Remote::File(path) => {
                Ok((component_log::read_file_remote(&path, &input.identity)?, true))
            }
        }
    })?;
    Ok((rows.len(), json!({"logs": rows, "parentsAvailable": parents_available})))
}

async fn fetch_lane(
    network: &Network,
    url: &str,
    id: &lane::Id,
    all_history: bool,
    fetch_deps: bool,
) -> io::Result<(Vec<ObjectItem>, String)> {
    let lane_id = format!("{}/{}", id.scope, id.name);
    let mut items = network.fetch_bounded(
        url,
        std::slice::from_ref(&lane_id),
        &FetchOptions::lanes(),
        MAX_INBOUND_BYTES,
    )
    .await?;
    let (hash, components) = lane_targets(id, &items)?;
    if !components.is_empty() {
        let mut options = FetchOptions::with_dependencies(Some(lane_id), false);
        options.traversal.collect_parents = all_history;
        options.traversal.prefer_dependency_graph = !fetch_deps;
        items.extend(network.fetch_bounded(url, &components, &options, MAX_INBOUND_BYTES).await?);
    }
    Ok((items, hash))
}

fn lane_targets(id: &lane::Id, items: &[ObjectItem]) -> io::Result<(String, Vec<String>)> {
    let (hash, entries) = remote_lane(id, items)?;
    let targets = entries
        .into_iter()
        .map(|entry| format!("{}@{}", entry.identity, entry.head))
        .collect();
    Ok((hash, targets))
}

fn remote_lane(id: &lane::Id, items: &[ObjectItem]) -> io::Result<(String, Vec<lane::Entry>)> {
    let mut selected = None;
    for item in items {
        let raw = crate::checkout::repository::inflate(&item.compressed, 32 * 1024 * 1024)?;
        if !raw.starts_with(b"Lane ") {
            continue;
        }
        let (_, body) = crate::checkout::repository::split(
            &raw,
            crate::merge_history::hash(&item.hash)?,
            "Lane",
        )?;
        let value: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
        if value["scope"] != id.scope || value["name"] != id.name || selected.is_some() {
            return Err(invalid("inbound HTTP Lane identity"));
        }
        lane::validate_value(id, &value)?;
        let entries = lane::entries(&value)?;
        if entries.len() > 4096 {
            return Err(invalid("inbound HTTP Lane component limit"));
        }
        selected = Some((item.hash.clone(), entries));
    }
    selected.ok_or_else(|| invalid("inbound HTTP Lane missing"))
}

pub(super) fn lane_entries(
    remote: &VirtualRemote,
    hash: &str,
    id: &lane::Id,
) -> io::Result<Vec<lane::Entry>> {
    let compressed = remote.objects
        .iter()
        .find(|(item_hash, _)| item_hash == hash)
        .map(|(_, bytes)| bytes.clone())
        .ok_or_else(|| invalid("inbound HTTP Lane capture"))?;
    let item = ObjectItem { hash: hash.to_owned(), compressed, scope: None };
    remote_lane(id, &[item]).map(|(_, entries)| entries)
}

pub(super) fn objects(input: &Prepare, targets: &[Target]) -> io::Result<Vec<VirtualRemote>> {
    let (remotes, network, global, local) =
        connection::with_home(&input.root, &input.transport, &input.home)?;
    let groups = group_targets(targets, &local)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    runtime.block_on(fetch_groups(
        input,
        groups,
        &remotes,
        &network,
        fetch::concurrency(&global).min(4),
    ))
}

fn group_targets(targets: &[Target], local: &str) -> io::Result<BTreeMap<String, Vec<String>>> {
    let mut grouped = BTreeMap::<String, Vec<String>>::new();
    for target in targets {
        let scope = target.scope.as_ref().ok_or_else(|| invalid("inbound target scope"))?;
        if scope != local {
            grouped
                .entry(scope.clone())
                .or_default()
                .push(identity(target)?);
        }
    }
    Ok(grouped)
}

async fn fetch_groups(
    input: &Prepare,
    groups: BTreeMap<String, Vec<String>>,
    remotes: &Remotes,
    network: &Network,
    limit: usize,
) -> io::Result<Vec<VirtualRemote>> {
    stream::iter(groups)
        .map(|(scope, ids)| fetch_one(input, scope, ids, remotes, network))
        .buffered(limit)
        .try_fold((Vec::new(), 0usize), |retained, (scope, items)| async move {
            collect(retained, &input.root, scope, items)
        })
        .await
        .map(|(remotes, _)| remotes)
}

async fn fetch_one(
    input: &Prepare,
    scope: String,
    ids: Vec<String>,
    remotes: &Remotes,
    network: &Network,
) -> io::Result<(String, Option<Vec<ObjectItem>>)> {
    let all_history = input.options.all_history;
    let fetch_dependencies = input.options.dependencies.fetch_deps;
    let without_dependencies = input.operation == "diff";
    let Remote::Http(url) = remotes.resolve(&scope, network).await? else {
        return Ok((scope, None));
    };
    if !all_history && !fetch_dependencies && !without_dependencies {
        return Ok((scope, Some(fetch_in_two_steps(&input.root, &url, &ids, network).await?)));
    }
    let mut options = if without_dependencies {
        FetchOptions::without_dependencies(None)
    } else {
        FetchOptions::with_dependencies(None, false)
    };
    options.traversal.collect_parents = all_history;
    options.traversal.prefer_dependency_graph = !fetch_dependencies;
    let items = network.fetch_bounded(&url, &ids, &options, MAX_INBOUND_BYTES).await?;
    Ok((scope, Some(items)))
}

async fn fetch_in_two_steps(
    root: &Path,
    url: &str,
    ids: &[String],
    network: &Network,
) -> io::Result<Vec<ObjectItem>> {
    let mut items =
        network.fetch_bounded(url, ids, &FetchOptions::latest(None, false), MAX_INBOUND_BYTES)
            .await?;
    let requests = missing::requests(&items, ids, root);
    if !requests.is_empty() {
        let options = FetchOptions::with_dependencies(None, false);
        items.extend(network.fetch_bounded(url, &requests, &options, MAX_INBOUND_BYTES).await?);
    }
    Ok(items)
}

fn collect(
    (mut retained, mut total): (Vec<VirtualRemote>, usize),
    root: &Path,
    scope: String,
    items: Option<Vec<ObjectItem>>,
) -> io::Result<(Vec<VirtualRemote>, usize)> {
    let Some(items) = items else { return Ok((retained, total)) };
    let mut objects = HashMap::<String, Vec<u8>>::new();
    for item in items {
        total = total
            .checked_add(item.compressed.len())
            .ok_or_else(|| invalid("inbound remote object bounds"))?;
        if total > MAX_INBOUND_BYTES || objects.len() >= MAX_INBOUND_OBJECTS {
            return Err(invalid("inbound remote object bounds"));
        }
        match objects.entry(item.hash) {
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(item.compressed);
            }
            std::collections::hash_map::Entry::Occupied(entry)
                if entry.get() == &item.compressed => {}
            std::collections::hash_map::Entry::Occupied(_) => {
                return Err(invalid("inbound duplicate object differs"));
            }
        }
    }
    retained.push(VirtualRemote {
        path: crate::scope_path(root).join(".rust-inbound-virtual").join(&scope),
        scope,
        objects: objects.into_iter().collect(),
    });
    Ok((retained, total))
}
