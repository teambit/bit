//! The public remote component history GraphQL projection.

use super::{Network, network_error, throw_for_status};
use crate::invalid;
use futures_util::StreamExt;
use reqwest::Response;
use serde_json::{Value, json};
use std::io;

const LOG_QUERY: &str = "query getLogs($id: String!) { scope { getLogs(id: $id) { message username email date hash tag } } }";
const MAX_LOG_BYTES: usize = 8 * 1024 * 1024;

impl Network {
    /// `Http.log()`: read-only history in the order supplied by the scope.
    pub async fn log(&self, url: &str, id: &str) -> io::Result<Vec<Value>> {
        let endpoint = format!("{}/graphql", url.trim().trim_end_matches('/'));
        let body = json!({"query": LOG_QUERY, "variables": {"id": id.trim()}});
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

fn parse(bytes: &[u8], endpoint: &str) -> io::Result<Vec<Value>> {
    let parsed: Value = serde_json::from_slice(bytes).map_err(|_| {
            invalid(&format!("fatal: failed parsing http json response, please make sure the response is a valid json object. url: {endpoint}"))
        })?;
    if let Some(message) = parsed["errors"][0]["message"]
        .as_str()
        .map(str::trim)
        .filter(|message| !message.is_empty())
    {
        return Err(io::Error::other(message.to_string()));
    }
    let rows = parsed["data"]["scope"]["getLogs"]
        .as_array()
        .ok_or_else(|| invalid("remote log response"))?;
    if rows.len() > 16384 {
        return Err(invalid("remote log exceeds bounds"));
    }
    rows.iter().map(validate_row).collect()
}

fn validate_row(row: &Value) -> io::Result<Value> {
    let Some(object) = row.as_object() else { return Err(invalid("remote log row")) };
    let expected = ["message", "username", "email", "date", "hash", "tag"];
    if !expected
        .iter()
        .all(|key| object.contains_key(*key))
        || object
            .keys()
            .any(|key| key != "__typename" && !expected.contains(&key.as_str()))
        || !row["hash"].is_string()
        || !row["message"].is_string()
        || !matches!(row["date"], Value::Null | Value::String(_) | Value::Number(_))
        || ["username", "email", "tag"]
            .iter()
            .any(|key| !row[*key].is_null() && !row[*key].is_string())
    {
        return Err(invalid("remote log row"));
    }
    let mut normalized = row.clone();
    if let Some(number) = normalized["date"].as_i64() {
        normalized["date"] = Value::String(number.to_string());
    }
    Ok(normalized)
}
