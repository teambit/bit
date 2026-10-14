//! `FETCH_OPTIONS` and fetching from one or many remotes (`ObjectFetcher.fetchFromSingleRemote`).

pub use bit_client_transfer::fetch::{FetchOptions, concurrency};

use super::{
    fs_remote,
    http::Network,
    remotes::{Remote, Remotes},
    tar::ObjectItem,
};
use futures_util::{StreamExt, stream};
use indexmap::IndexMap;
use std::io;

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
