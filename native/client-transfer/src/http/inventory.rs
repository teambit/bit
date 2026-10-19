//! Public remote list and latest-version GraphQL, with bounded JSON responses.
use super::{LIST_QUERY, Listed, Network, network_error, throw_for_status};
use crate::invalid;
use serde_json::{Map, Value, json};
use std::io;

const LIST_DELETED_QUERY: &str = r#"query list($namespaces: [String!], $includeDeleted: Boolean) { scope { components(namespaces: $namespaces, includeDeleted: $includeDeleted) { id { scope version name } aspects(include: ["teambit.component/remove"]) { id config } deprecation { isDeprecate } } } }"#;
const LATEST_VERSIONS_QUERY: &str =
    "query getLatestVersions($ids: [String]!) { scope { _legacyLatestVersions(ids: $ids) } }";
const MAX_GRAPHQL_BYTES: usize = 8 * 1024 * 1024;

impl Network {
    /// `Http.list` with the published `includeDeleted` projection. Older
    /// servers need the canonical client's warning and therefore decline.
    pub async fn inventory(
        &self,
        url: &str,
        namespaces: Option<&str>,
        include_deleted: bool,
    ) -> io::Result<Vec<Value>> {
        let query = if include_deleted { LIST_DELETED_QUERY } else { LIST_QUERY };
        let body = json!({
            "query": query,
            "variables": list_variables(namespaces, include_deleted),
        });
        let response = self.graphql_bounded(&format!("{url}/graphql"), &body).await?;
        if include_deleted && unknown_include_deleted(&response) {
            return Err(invalid("remote include-deleted needs canonical warning"));
        }
        graphql_error(&response)?;
        inventory_rows(&response, include_deleted)
    }

    /// `Http.latestVersions`: GraphQL returns ids in the remote's own order.
    pub async fn latest_versions(&self, url: &str, ids: &[String]) -> io::Result<Vec<String>> {
        let response = self.graphql_bounded(
            &format!("{url}/graphql"),
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
            if chunk.len() > MAX_GRAPHQL_BYTES - bytes.len() {
                return Err(invalid("remote GraphQL response limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| invalid("remote GraphQL response"))
    }
}

fn list_variables(namespaces: Option<&str>, include_deleted: bool) -> Value {
    let mut variables = Map::new();
    if let Some(namespaces) = namespaces {
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

#[cfg(test)]
mod tests;
