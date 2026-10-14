//! Bounded HTTP scope acquisition. File scopes stay in the deferred importer.
use super::{Prepare, Target, VirtualRemote, identity, invalid};
use crate::command_import::lane;
use bit_client_transfer::{
    GlobalConfig,
    fetch::{self, FetchOptions},
    http::Network,
    remotes::{Remote, Remotes},
    resolver::Resolver,
    tar::ObjectItem,
};
use futures_util::{StreamExt, TryStreamExt, stream};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap},
    fs, io,
    path::Path,
};

const MAX_INBOUND_BYTES: usize = 96 * 1024 * 1024;

/// Retain an HTTP lane and its component closure before the import owner
/// publishes anything. File remotes continue through the deferred importer.
pub(super) fn lane_objects(
    input: &Prepare,
    id: &lane::Id,
) -> io::Result<Option<(VirtualRemote, String)>> {
    id.validate()?;
    let (remotes, network, _, _) = connection(input)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    runtime.block_on(async {
        let Remote::Http(url) = remotes.resolve(&id.scope, &network).await? else {
            return Ok(None);
        };
        let (items, hash) = fetch_lane(&network, &url, id).await?;
        let (mut remotes, _) =
            collect((Vec::new(), 0), &input.root, id.scope.clone(), Some(items))?;
        let remote = remotes.pop().ok_or_else(|| invalid("inbound lane remote"))?;
        Ok(Some((remote, hash)))
    })
}

fn connection(input: &Prepare) -> io::Result<(Remotes, Network, GlobalConfig, String)> {
    let scope: Value = serde_json::from_slice(&fs::read(input.root.join(".bit/scope.json"))?)
        .map_err(io::Error::other)?;
    let local = scope["name"].as_str().ok_or_else(|| invalid("inbound local scope"))?;
    let global = global_config(input)?;
    let resolver = Resolver::configured(
        &scope,
        input.transport.node_executable.clone(),
        input.transport.bit_dir.clone(),
        local,
        &global,
    );
    let remotes =
        Remotes::load(&scope, &input.transport.global_config_dir, &global)?.with_resolver(resolver);
    let network = Network::new(
        &global,
        &input.transport.bit_version,
        Some(local),
        input.transport.token.as_deref(),
    )?;
    Ok((remotes, network, global, local.to_owned()))
}

async fn fetch_lane(
    network: &Network,
    url: &str,
    id: &lane::Id,
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
        let mut more = network.fetch_bounded(
            url,
            &components,
            &FetchOptions::with_dependencies(Some(lane_id), false),
            MAX_INBOUND_BYTES,
        )
        .await?;
        items.append(&mut more);
    }
    Ok((items, hash))
}

fn lane_targets(id: &lane::Id, items: &[ObjectItem]) -> io::Result<(String, Vec<String>)> {
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
        let entries = lane::entries(&value)?;
        if entries.len() > 4096 {
            return Err(invalid("inbound HTTP Lane component limit"));
        }
        selected = Some((
            item.hash.clone(),
            entries
                .into_iter()
                .map(|entry| format!("{}@{}", entry.identity, entry.head))
                .collect(),
        ));
    }
    selected.ok_or_else(|| invalid("inbound HTTP Lane missing"))
}

pub(super) fn objects(input: &Prepare, targets: &[Target]) -> io::Result<Vec<VirtualRemote>> {
    let (remotes, network, global, local) = connection(input)?;
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

fn global_config(input: &Prepare) -> io::Result<GlobalConfig> {
    match fs::read(input.transport.global_config_dir.join("config.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(GlobalConfig::new()),
        Err(error) => Err(error),
    }
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
    let (remotes, _) = stream::iter(groups)
        .map(|(scope, ids)| fetch_one(scope, ids, input.options.all_history, remotes, network))
        .buffered(limit)
        .try_fold((Vec::new(), 0usize), |retained, (scope, items)| async move {
            collect(retained, &input.root, scope, items)
        })
        .await?;
    Ok(remotes)
}

async fn fetch_one(
    scope: String,
    ids: Vec<String>,
    all_history: bool,
    remotes: &Remotes,
    network: &Network,
) -> io::Result<(String, Option<Vec<ObjectItem>>)> {
    let remote = remotes.resolve(&scope, network).await?;
    let Remote::Http(url) = remote else { return Ok((scope, None)) };
    let mut options = FetchOptions::with_dependencies(None, false);
    options.traversal.collect_parents = all_history;
    let items = network.fetch_bounded(&url, &ids, &options, MAX_INBOUND_BYTES).await?;
    Ok((scope, Some(items)))
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
        if total > MAX_INBOUND_BYTES || objects.len() >= 16384 {
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
        path: root.join(".bit/.rust-inbound-virtual").join(&scope),
        scope,
        objects: objects.into_iter().collect(),
    });
    Ok((retained, total))
}
