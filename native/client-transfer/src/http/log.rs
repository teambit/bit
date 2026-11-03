//! The public remote component history `GraphQL` projection.
//!
//! Extends [`Network`] with [`Network::log`] using [`LOG_QUERY`] to fetch component history within [`MAX_LOG_BYTES`].

use super::{Network, network_error, throw_for_status};
use crate::invalid;
use futures_util::StreamExt;
use reqwest::Response;
use serde_json::{Value, json};
use std::io;

/// `GraphQL` query (`getLogs`) for fetching a component's version log history via [`Network::log`].
const LOG_QUERY: &str = "query getLogs($id: String!) { scope { getLogs(id: $id) { message username email date hash tag } } }";
/// Maximum buffered response size (`8 MiB`) for remote `getLogs` `GraphQL` queries.
const MAX_LOG_BYTES: usize = 8 * 1024 * 1024;

impl Network {
    /// `Http.log()`: read-only history in the order supplied by the scope.
    pub async fn log(&self, url: &str, id: &str) -> io::Result<Vec<Value>> {
        let base = url.trim().trim_end_matches('/');
        let id = id.trim();
        if base.is_empty() || id.is_empty() {
            return Err(invalid("remote log request"));
        }
        let endpoint = format!("{base}/graphql");
        let body = json!({"query": LOG_QUERY, "variables": {"id": id}});
        let response = self.send(
            self.headers(self.client.post(&endpoint), "read")?
                .json(&body),
        )
        .await?;
        let bytes =
            self.cancellation.run(async { bounded_body(throw_for_status(response).await?).await })
                .await??;
        parse(&bytes, &endpoint)
    }
}

/// Stream and buffer the body of [`Response`] `response` up to [`MAX_LOG_BYTES`].
async fn bounded_body(response: Response) -> io::Result<Vec<u8>> {
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| network_error(&error))?;
        if chunk.len() > MAX_LOG_BYTES.saturating_sub(bytes.len()) {
            return Err(invalid("remote log exceeds bounds"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

/// Parses and validates the `data.scope.getLogs` array from a remote `getLogs` `GraphQL` response.
#[inline]
fn parse(bytes: &[u8], endpoint: &str) -> io::Result<Vec<Value>> {
    let mut parsed: Value = serde_json::from_slice(bytes).map_err(|_| {
            invalid(&format!("fatal: failed parsing http json response, please make sure the response is a valid json object. url: {endpoint}"))
        })?;
    if let Some(message) = parsed["errors"][0]["message"]
        .as_str()
        .map(str::trim)
        .filter(|message| !message.is_empty())
    {
        return Err(io::Error::other(message.to_string()));
    }
    let Value::Array(rows) = parsed["data"]["scope"]["getLogs"].take() else {
        return Err(invalid("remote log response"));
    };
    if rows.len() > 16384 {
        return Err(invalid("remote log exceeds bounds"));
    }
    rows.into_iter()
        .map(validate_row)
        .collect()
}

/// Validates that a `getLogs` row object has the required schema and strips `__typename`.
#[inline]
fn validate_row(mut row: Value) -> io::Result<Value> {
    let Some(object) = row.as_object() else { return Err(invalid("remote log row")) };
    let expected = ["message", "username", "email", "date", "hash", "tag"];
    let valid_date = row["date"].is_null()
        || row["date"].is_string()
        || row["date"].is_i64()
        || row["date"].is_u64();
    if !expected
        .iter()
        .all(|key| object.contains_key(*key))
        || object
            .keys()
            .any(|key| key != "__typename" && !expected.contains(&key.as_str()))
        || row["hash"]
            .as_str()
            .map(str::trim)
            .is_none_or(str::is_empty)
        || !row["message"].is_string()
        || !valid_date
        || ["username", "email", "tag"]
            .iter()
            .any(|key| !row[*key].is_null() && !row[*key].is_string())
    {
        return Err(invalid("remote log row"));
    }
    if let Some(number) = row["date"]
        .as_i64()
        .map(|val| val.to_string())
        .or_else(|| row["date"].as_u64().map(|val| val.to_string()))
    {
        row["date"] = Value::String(number);
    }
    Ok(row)
}
