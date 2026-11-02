//! Ordered latest-version groups ([`versions`], [`Request`], [`file_latest`], [`remote_for`]) for remote inventory queries.

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

/// Resolves ordered latest-version groups across HTTP and file [`Remotes`] for [`Request`].
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

/// Sorts completed `(index, rows)` groups by input order and flattens them into JSON strings.
fn results(finished: Vec<io::Result<(usize, Vec<String>)>>) -> io::Result<Vec<Value>> {
    let mut groups = Vec::with_capacity(finished.len());
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

/// Groups requested component IDs by scope in insertion order within the 4,096-ID limit.
fn jobs(input: &Request) -> io::Result<Vec<(String, Vec<String>)>> {
    if input.selection.ids.len() > 4096 {
        return Err(invalid("remote latest versions id limit"));
    }
    let mut grouped = IndexMap::<String, Vec<String>>::with_capacity(input.selection.ids.len());
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

/// Queries and validates latest `<scope>/<name>@<version>` rows for `ids` in `scope` against `remote`.
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
                let ver = ver.trim();
                ver.is_empty()
                    || ver.len() > 256
                    || ver.chars().any(char::is_control)
                    || identity(row).ok() != identity(requested).ok()
            })
    {
        return Err(invalid("remote latest versions result"));
    }
    Ok(rows)
}
