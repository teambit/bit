//! Ordered latest-version groups. All launched groups finish before reporting an error.
use super::{Request, file_latest, identity, invalid, remote_for};
use bit_client_transfer::{
    GlobalConfig, fetch,
    http::Network,
    remotes::{Remote, Remotes},
};
use futures_util::{StreamExt, stream};
use indexmap::IndexMap;
use serde_json::Value;
use std::io;

pub(super) async fn versions(
    input: &Request,
    remotes: &Remotes,
    network: &Network,
    global: &GlobalConfig,
) -> io::Result<Vec<Value>> {
    let jobs = jobs(input)?;
    let concurrency = fetch::concurrency(global).clamp(1, 4);
    let finished = stream::iter(jobs.into_iter().enumerate())
        .map(|(index, (scope, ids))| async move {
            let remote = remote_for(input, &scope, remotes, network).await?;
            group(scope, ids, remote, network).await.map(|rows| (index, rows))
        })
        .buffer_unordered(concurrency)
        .collect::<Vec<_>>()
        .await;
    results(finished)
}

fn results(finished: Vec<io::Result<(usize, Vec<String>)>>) -> io::Result<Vec<Value>> {
    let mut groups = Vec::new();
    let mut first_error = None;
    for result in finished {
        match result {
            Ok(group) => groups.push(group),
            Err(error) if first_error.is_none() => first_error = Some(error),
            Err(_) => {}
        }
    }
    if let Some(error) = first_error {
        return Err(error);
    }
    groups.sort_by_key(|(index, _)| *index);
    Ok(groups
        .into_iter()
        .flat_map(|(_, rows)| rows.into_iter().map(Value::String))
        .collect())
}

fn jobs(input: &Request) -> io::Result<Vec<(String, Vec<String>)>> {
    if input.selection.ids.len() > 4096 {
        return Err(invalid("remote latest versions id limit"));
    }
    let mut grouped = IndexMap::<String, Vec<String>>::new();
    for id in &input.selection.ids {
        let id = id.trim();
        let (scope, _) = identity(id)?;
        grouped
            .entry(scope.to_owned())
            .or_default()
            .push(id.to_owned());
    }
    Ok(grouped.into_iter().collect())
}

async fn group(
    scope: String,
    ids: Vec<String>,
    remote: Remote,
    network: &Network,
) -> io::Result<Vec<String>> {
    let rows = match remote {
        Remote::File(path) => file_latest(&path, &scope, &ids),
        Remote::Http(url) => network.latest_versions(&url, &ids).await,
    }?
    .into_iter()
    .map(|row| row.trim().to_owned())
    .collect::<Vec<_>>();
    if rows.len() != ids.len()
        || rows
            .iter()
            .zip(&ids)
            .any(|(row, requested)| {
                let Some((_, ver)) = row.rsplit_once('@') else {
                    return true;
                };
                ver.trim().is_empty() || identity(row).ok() != identity(requested).ok()
            })
    {
        return Err(invalid("remote latest versions result"));
    }
    Ok(rows)
}
