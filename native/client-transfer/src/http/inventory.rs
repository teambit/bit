//! Public remote list and latest-version GraphQL, with bounded JSON responses.
#[cfg(test)]
mod tests;

use super::{LIST_QUERY, Listed, Network, network_error, throw_for_status};
use crate::invalid;
use serde_json::{Map, Value, json};
use std::io;

#[derive(Debug)]
struct OldServerFallbackError(String);
impl std::fmt::Display for OldServerFallbackError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}
impl std::error::Error for OldServerFallbackError {}

/// The published warning was already observable before a failed retry.
pub fn old_server_fallback(error: &io::Error) -> bool {
    error.get_ref().is_some_and(<dyn std::error::Error + Send + Sync>::is::<OldServerFallbackError>)
}

fn fallback_error(error: &io::Error) -> io::Error {
    io::Error::other(OldServerFallbackError(error.to_string()))
}

const LIST_DELETED_QUERY: &str = r#"query list($namespaces: [String!], $includeDeleted: Boolean) { scope { components(namespaces: $namespaces, includeDeleted: $includeDeleted) { id { scope version name } aspects(include: ["teambit.component/remove"]) { id config } deprecation { isDeprecate } } } }"#;
const LATEST_VERSIONS_QUERY: &str =
    "query getLatestVersions($ids: [String]!) { scope { _legacyLatestVersions(ids: $ids) } }";
const MAX_GRAPHQL_BYTES: usize = 8 * 1024 * 1024;

impl Network {
    /// `Http.list` with the published `includeDeleted` projection.
    pub async fn inventory(
        &self,
        url: &str,
        namespaces: Option<&str>,
        include_deleted: bool,
    ) -> io::Result<Vec<Value>> {
        self.inventory_with_warning(url, namespaces, include_deleted).await.map(|(rows, _)| rows)
    }

    /// Return the rows and whether the published older-server warning precedes them.
    pub async fn inventory_with_warning(
        &self,
        url: &str,
        namespaces: Option<&str>,
        include_deleted: bool,
    ) -> io::Result<(Vec<Value>, bool)> {
        let query = if include_deleted { LIST_DELETED_QUERY } else { LIST_QUERY };
        let body = json!({
            "query": query,
            "variables": list_variables(namespaces, include_deleted),
        });
        let endpoint = format!("{}/graphql", url.trim().trim_end_matches('/'));
        let response = self.graphql_bounded(&endpoint, &body).await?;
        if include_deleted && unknown_include_deleted(&response) {
            let fallback = self
                .graphql_bounded(
                    &endpoint,
                    &json!({
                        "query": LIST_QUERY,
                        "variables": list_variables(namespaces, false),
                    }),
                )
                .await
                .map_err(|error| fallback_error(&error))?;
            graphql_error(&fallback).map_err(|error| fallback_error(&error))?;
            return inventory_rows(&fallback, false)
                .map(|rows| (rows, true))
                .map_err(|error| fallback_error(&error));
        }
        graphql_error(&response)?;
        inventory_rows(&response, include_deleted).map(|rows| (rows, false))
    }

    /// `Http.latestVersions`: GraphQL returns ids in the remote's own order.
    pub async fn latest_versions(&self, url: &str, ids: &[String]) -> io::Result<Vec<String>> {
        let response = self.graphql_bounded(
            &format!("{}/graphql", url.trim().trim_end_matches('/')),
            &json!({
                "query": LATEST_VERSIONS_QUERY,
                "variables": {"ids": ids},
            }),
        )
        .await?;
        graphql_error(&response)?;
        response["data"]["scope"]["_legacyLatestVersions"]
            .as_array()
            .ok_or_else(|| invalid("remote latest versions response"))?
            .iter()
            .map(|id| {
                id.as_str()
                    .map(str::trim)
                    .filter(|id| !id.is_empty())
                    .map(str::to_owned)
                    .ok_or_else(|| invalid("remote latest version id"))
            })
            .collect()
    }

    async fn graphql_bounded(&self, url: &str, body: &Value) -> io::Result<Value> {
        let response = self.send(
            self.headers(self.client.post(url), "read")?
                .json(body),
        )
        .await?;
        let mut response = self.cancellation.run(throw_for_status(response)).await??;
        let mut bytes = Vec::new();
        while let Some(chunk) =
            self.cancellation.run(response.chunk()).await?.map_err(|error| network_error(&error))?
        {
            if chunk.len() > MAX_GRAPHQL_BYTES.saturating_sub(bytes.len()) {
                return Err(invalid("remote GraphQL response limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| invalid("remote GraphQL response"))
    }
}

fn list_variables(namespaces: Option<&str>, include_deleted: bool) -> Value {
    let mut variables = Map::new();
    if let Some(namespaces) = namespaces
        .map(str::trim)
        .filter(|ns| !ns.is_empty())
    {
        variables.insert("namespaces".to_owned(), json!([namespaces]));
    }
    if include_deleted {
        variables.insert("includeDeleted".to_owned(), json!(true));
    }
    Value::Object(variables)
}

fn unknown_include_deleted(response: &Value) -> bool {
    response["errors"][0]["message"]
        .as_str()
        .is_some_and(|message| {
            message.contains("Unknown argument") && message.contains("includeDeleted")
        })
}

fn graphql_error(response: &Value) -> io::Result<()> {
    if let Some(message) = response["errors"][0]["message"].as_str() {
        return Err(io::Error::other(message.to_owned()));
    }
    Ok(())
}

fn inventory_rows(response: &Value, include_deleted: bool) -> io::Result<Vec<Value>> {
    let components = response["data"]["scope"]["components"]
        .as_array()
        .ok_or_else(|| invalid("remote inventory response"))?;
    if components.len() > 4096 {
        return Err(invalid("remote inventory limit"));
    }
    components
        .iter()
        .map(|component| {
            let listed = Listed::parse(component)?;
            let mut row = json!({"id": listed.id(), "deprecated": listed.deprecated});
            if include_deleted
                && let Some(removed) = component["aspects"]
                    .as_array()
                    .and_then(|aspects| {
                        aspects
                            .iter()
                            .find(|aspect| aspect["id"] == "teambit.component/remove")
                    })
                    .and_then(|aspect| aspect["config"].get("removed"))
            {
                row["removed"] = removed.clone();
            }
            Ok(row)
        })
        .collect()
}
