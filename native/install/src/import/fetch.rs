//! `FETCH_OPTIONS` and fetching from one or many remotes (`ObjectFetcher.fetchFromSingleRemote`).

use super::{
    fs_remote,
    http::Network,
    remotes::{Remote, Remotes},
    tar::ObjectItem,
};
use crate::model::GlobalConfig;
use futures_util::{StreamExt, stream};
use indexmap::IndexMap;
use serde::Serialize;
use serde_json::Value;
use std::io;

/// `CURRENT_FETCH_SCHEMA`.
const FETCH_SCHEMA: &str = "0.0.3";

/// `FETCH_OPTIONS` as sent to a remote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchOptions {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub fetch_schema: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane_id: Option<String>,
    #[serde(flatten)]
    pub traversal: Traversal,
    #[serde(flatten)]
    pub selection: Selection,
}

/// What to collect around each requested version.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Traversal {
    /// Backward compatibility with remotes older than 0.0.900.
    pub without_dependencies: bool,
    pub include_dependencies: bool,
    pub prefer_dependency_graph: bool,
    pub only_if_built: bool,
    pub include_version_history: bool,
    pub collect_parents: bool,
}

/// Which components a remote returns.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub include_artifacts: bool,
    pub allow_external: bool,
    pub ignore_missing_head: bool,
    pub return_nothing_if_given_version_exists: bool,
    pub include_lane_history: bool,
}

impl FetchOptions {
    /// `importWithoutDeps` with `fetchHeadIfLocalIsBehind` (`getExternalManyWithoutDeps`).
    #[must_use]
    pub fn latest(lane_id: Option<String>, delta: bool) -> Self {
        Self {
            kind: "component",
            fetch_schema: FETCH_SCHEMA,
            traversal: Traversal {
                without_dependencies: true,
                include_version_history: true,
                ..Traversal::default()
            },
            selection: Selection {
                allow_external: lane_id.is_some(),
                ignore_missing_head: true,
                return_nothing_if_given_version_exists: delta,
                ..Selection::default()
            },
            lane_id,
        }
    }

    /// `importWithoutDeps` with the defaults: the given versions only.
    #[must_use]
    pub fn without_dependencies(lane_id: Option<String>) -> Self {
        Self {
            kind: "component",
            fetch_schema: FETCH_SCHEMA,
            traversal: Traversal { without_dependencies: true, ..Traversal::default() },
            selection: Selection { allow_external: lane_id.is_some(), ..Selection::default() },
            lane_id,
        }
    }

    /// `getExternalMany`: versions with their dependencies.
    #[must_use]
    pub fn with_dependencies(lane_id: Option<String>, only_if_built: bool) -> Self {
        Self {
            kind: "component",
            fetch_schema: FETCH_SCHEMA,
            traversal: Traversal {
                include_dependencies: true,
                prefer_dependency_graph: true,
                only_if_built,
                include_version_history: true,
                ..Traversal::default()
            },
            selection: Selection { allow_external: lane_id.is_some(), ..Selection::default() },
            lane_id,
        }
    }

    /// `importLanes`: lane objects.
    #[must_use]
    pub fn lanes() -> Self {
        Self {
            kind: "lane",
            fetch_schema: FETCH_SCHEMA,
            lane_id: None,
            traversal: Traversal { without_dependencies: true, ..Traversal::default() },
            selection: Selection::default(),
        }
    }
}

/// `CONCURRENT_FETCH_LIMIT`.
const DEFAULT_CONCURRENCY: usize = 15;

/// `concurrentFetchLimit()`: `concurrency.fetch` from the bit config, else 15.
#[must_use]
pub fn concurrency(global: &GlobalConfig) -> usize {
    global
        .get("concurrency.fetch")
        .and_then(|value| match value {
            Value::Number(number) => number.as_u64(),
            Value::String(text) => text.parse().ok(),
            _ => None,
        })
        .and_then(|limit| usize::try_from(limit).ok())
        .filter(|limit| *limit > 0)
        .unwrap_or(DEFAULT_CONCURRENCY)
}

/// Fetches through the right transport for each remote scope.
pub struct Fetcher<'a> {
    pub remotes: &'a Remotes,
    pub network: &'a Network,
    /// How many remotes are fetched at the same time (`concurrentFetchLimit`).
    pub concurrency: usize,
}

/// The objects each remote returned, keyed by the remote scope name.
pub type PerRemote = IndexMap<String, Vec<ObjectItem>>;

impl Fetcher<'_> {
    /// Fetch `ids` grouped by remote scope, `concurrency` remotes at a time
    /// (`pMapPool`), keeping the groups' order. A scope that is not found is
    /// skipped (`throwOnUnavailableScope` is off for these imports); network
    /// failures of all remotes are reported together.
    pub async fn fetch(
        &self,
        grouped: &IndexMap<String, Vec<String>>,
        options: &FetchOptions,
    ) -> io::Result<PerRemote> {
        let fetched: Vec<(&String, io::Result<Vec<ObjectItem>>)> = stream::iter(grouped)
            .map(|(scope, ids)| async move { (scope, self.fetch_one(scope, ids, options).await) })
            .buffered(self.concurrency.max(1))
            .collect()
            .await;
        let mut results = PerRemote::new();
        let mut failed = Vec::new();
        for (scope, result) in fetched {
            match result {
                Ok(items) => {
                    results.insert(scope.clone(), items);
                }
                Err(error) if error.kind() == io::ErrorKind::ConnectionAborted => {
                    failed.push((scope, error));
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound && options.kind != "lane" => {
                }
                Err(error) => return Err(error),
            }
        }
        if failed.is_empty() {
            return Ok(results);
        }
        Err(failed_scopes(&failed))
    }

    async fn fetch_one(
        &self,
        scope: &str,
        ids: &[String],
        options: &FetchOptions,
    ) -> io::Result<Vec<ObjectItem>> {
        let remote = self.remotes.resolve(scope, self.network).await.map_err(|error| {
            if error.kind() != io::ErrorKind::NotFound {
                return error;
            }
            io::Error::other(format!(
                "unable to import the following component(s): {}.\nthe remote scope \"{scope}\" was not found",
                ids.join(", "),
            ))
        })?;
        match remote {
            Remote::File(path) => fs_remote::fetch(&path, ids, options),
            Remote::Http(url) => self.network.fetch(&url, ids, options).await,
        }
    }
}

fn failed_scopes(failed: &[(&String, io::Error)]) -> io::Error {
    let names: Vec<&str> = failed
        .iter()
        .map(|(scope, _)| scope.as_str())
        .collect();
    let messages: Vec<String> = failed
        .iter()
        .map(|(scope, error)| format!("{scope} - {error}"))
        .collect();
    io::Error::other(format!(
        "unexpected network error has occurred during fetching scopes: {}\nserver responded with the following error messages:\n{}",
        names.join(", "),
        messages.join("\n"),
    ))
}
