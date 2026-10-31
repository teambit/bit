//! Group all scopes, choose the direct or hub route, and drain every launched delete.

use super::Context;
use bit_client_transfer::{http::Network, remotes::Remote};
use bit_object_import::remote_delete::{Plan, ScopeGuard};
use serde_json::Value;
use std::{io, sync::Arc};

enum Group {
    File(Box<Plan>),
    FileLane { path: std::path::PathBuf, ids: Vec<String>, guard: ScopeGuard },
    Http { url: String, ids: Vec<String> },
    Hub { url: String, ids: Vec<String> },
}

pub(super) struct Prepared {
    pub(super) lanes: bool,
    force: bool,
    groups: Vec<Group>,
}

pub(super) fn prepare(
    context: &Context,
    ids: &[String],
    force: bool,
    lanes: bool,
) -> io::Result<Prepared> {
    let grouped = group(ids)?;
    if grouped.is_empty() {
        return Ok(Prepared { lanes, force, groups: Vec::new() });
    }
    let hub = grouped
        .iter()
        .map(|(scope, _)| context.remotes.configured(scope).map(|remote| remote.is_none()))
        .collect::<io::Result<Vec<_>>>()?;
    if hub.iter().any(|flag| *flag) && hub.iter().any(|flag| !*flag) {
        return Err(io::Error::other(
            "some of your components are configured to work with a local scope and some to the bit.cloud hub. this is not supported",
        ));
    }
    if hub.iter().all(|flag| *flag) {
        let url = context.hub_url.clone();
        let ids = hub_ids(ids, lanes);
        return Ok(Prepared { lanes, force, groups: vec![Group::Hub { url, ids }] });
    }
    let groups = direct(context, grouped, lanes, force)?;
    Ok(Prepared { lanes, force, groups })
}

fn hub_ids(ids: &[String], lanes: bool) -> Vec<String> {
    if lanes {
        return ids
            .iter()
            .map(|id| id.trim().to_owned())
            .collect();
    }
    ids.iter()
        .map(|id| format!("{}@latest", unversioned(id)))
        .collect()
}

fn unversioned(id: &str) -> &str {
    let trimmed = id.trim();
    match trimmed.rfind('@') {
        Some(index) if index > 0 && !trimmed[index + 1..].contains('/') => {
            trimmed[..index].trim_end()
        }
        _ => trimmed,
    }
}

fn group(ids: &[String]) -> io::Result<Vec<(String, Vec<String>)>> {
    let mut grouped: Vec<(String, Vec<String>)> = Vec::new();
    for id in ids {
        let trimmed = id.trim();
        let (scope, name) =
            trimmed.split_once('/').ok_or_else(|| io::Error::other("remote identity"))?;
        let scope = scope.trim();
        let name = name.trim();
        if scope.is_empty() || name.is_empty() || scope.contains("..") || name.contains("..") {
            return Err(io::Error::other("remote identity"));
        }
        if let Some((_, members)) = grouped
            .iter_mut()
            .find(|(existing_scope, _)| existing_scope == scope)
        {
            members.push(trimmed.to_owned());
        } else {
            grouped.push((scope.to_owned(), vec![trimmed.to_owned()]));
        }
    }
    Ok(grouped)
}

fn direct(
    context: &Context,
    grouped: Vec<(String, Vec<String>)>,
    lanes: bool,
    force: bool,
) -> io::Result<Vec<Group>> {
    let mut groups = Vec::new();
    for (scope, ids) in grouped {
        let remote = context.remotes
            .configured(&scope)?
            .ok_or_else(|| io::Error::other("remote configuration changed"))?;
        groups.push(direct_group(remote, ids, lanes, force)?);
    }
    Ok(groups)
}

fn direct_group(remote: Remote, ids: Vec<String>, lanes: bool, force: bool) -> io::Result<Group> {
    match remote {
        Remote::File(path) if lanes => {
            let guard = ScopeGuard::prepare(&path)?;
            Ok(Group::FileLane { path, ids, guard })
        }
        Remote::File(path) => Ok(Group::File(Box::new(Plan::components(&path, &ids, force)?))),
        Remote::Http(url) => {
            let ids = if lanes {
                ids
            } else {
                ids.iter()
                    .map(|id| unversioned(id).to_owned())
                    .collect()
            };
            Ok(Group::Http { url: url.trim().to_owned(), ids })
        }
    }
}

impl Prepared {
    /// Every group is launched before waiting. Once invoked, no group may be replayed.
    pub(super) fn commit(self, context: &Context) -> io::Result<Vec<Value>> {
        for group in &self.groups {
            match group {
                Group::File(plan) => plan.validate()?,
                Group::FileLane { guard, .. } => guard.validate()?,
                Group::Http { .. } | Group::Hub { .. } => {}
            }
        }
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
        let _entered = runtime.enter();
        let count = self.groups.len();
        let set = launch(self, context);
        runtime.block_on(drain(set, count))
    }
}

type Receipt = io::Result<(usize, Value)>;

fn launch(prepared: Prepared, context: &Context) -> tokio::task::JoinSet<Receipt> {
    let mut set = tokio::task::JoinSet::new();
    for (ordinal, group) in prepared.groups.into_iter().enumerate() {
        spawn_group(&mut set, ordinal, group, context, prepared.force, prepared.lanes);
    }
    set
}

fn spawn_group(
    set: &mut tokio::task::JoinSet<Receipt>,
    ordinal: usize,
    group: Group,
    context: &Context,
    force: bool,
    lanes: bool,
) {
    match group {
        Group::File(plan) => {
            set.spawn_blocking(move || {
                plan.commit()?;
                Ok::<_, io::Error>((ordinal, plan.receipt()))
            });
        }
        Group::FileLane { path, ids, guard } => {
            set.spawn_blocking(move || {
                guard.validate()?;
                let plan = Plan::lanes(&path, &ids, force)?;
                plan.commit()?;
                Ok::<_, io::Error>((ordinal, plan.receipt()))
            });
        }
        Group::Http { url, ids } => {
            let network = Arc::clone(&context.network);
            set.spawn(async move {
                Ok((ordinal, scope_receipt(&network, &url, &ids, force, lanes).await?))
            });
        }
        Group::Hub { url, ids } => {
            let network = Arc::clone(&context.hub_network);
            set.spawn(async move {
                Ok((ordinal, hub_receipt(&network, &url, &ids, force, lanes).await?))
            });
        }
    }
}

async fn scope_receipt(
    network: &Network,
    url: &str,
    ids: &[String],
    force: bool,
    lanes: bool,
) -> io::Result<Value> {
    if lanes {
        network.delete_scope_lanes(url, ids, force).await
    } else {
        network.delete_scope(url, ids, force).await
    }
}

async fn hub_receipt(
    network: &Network,
    url: &str,
    ids: &[String],
    force: bool,
    lanes: bool,
) -> io::Result<Value> {
    if lanes {
        network.delete_hub_lanes(url, ids, force).await
    } else {
        network.delete_hub(url, ids, force).await
    }
}

async fn drain(mut set: tokio::task::JoinSet<Receipt>, count: usize) -> io::Result<Vec<Value>> {
    let mut receipts = vec![Value::Null; count];
    let mut first_error = None;
    while let Some(result) = set.join_next().await {
        match result {
            Ok(Ok((ordinal, receipt))) => receipts[ordinal] = receipt,
            Ok(Err(error)) => {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(io::Error::other(error));
                }
            }
        }
    }
    first_error.map_or(Ok(receipts), Err)
}
