//! `Http.deleteMany` and `Http.deleteViaCentralHub`: one POST, no retry.
//! Calling either method crosses the remote mutation boundary. Any transport,
//! cancellation, status or parse error after invocation may hide a committed
//! delete; callers must never replay it through another implementation.
#[cfg(test)]
mod tests;

use super::{Network, network_error, remote_error, unexpected};
use crate::{invalid, tar};
use futures_util::StreamExt;
use reqwest::Response;
use serde_json::Value;
use std::io;

const MAX_DELETE_BYTES: usize = 8 * 1024 * 1024;
const MAX_DELETE_LINES: usize = 4096;

impl Network {
    /// `Http.deleteMany` for components on a configured HTTP scope. `ids`
    /// are unversioned `scope/name` strings selected by the public command.
    pub async fn delete_scope(&self, url: &str, ids: &[String], force: bool) -> io::Result<Value> {
        self.delete_scope_ids(url, ids, force, false).await
    }

    /// `Http.deleteMany` for lanes on a configured HTTP scope.
    pub async fn delete_scope_lanes(
        &self,
        url: &str,
        ids: &[String],
        force: bool,
    ) -> io::Result<Value> {
        self.delete_scope_ids(url, ids, force, true).await
    }

    async fn delete_scope_ids(
        &self,
        url: &str,
        ids: &[String],
        force: bool,
        lanes: bool,
    ) -> io::Result<Value> {
        let endpoint = format!("{}/api/scope/delete", url.trim_end_matches('/'));
        let ids = serde_json::to_string(ids).map_err(io::Error::other)?;
        let body = format!(r#"{{"ids":{ids},"force":{force},"lanes":{lanes}}}"#);
        let response = self.single_delete_post(&endpoint, body, None).await?;
        let status = response.status();
        let response_url = response.url().to_string();
        let bytes = self.delete_bytes(response).await?;
        if !status.is_success() {
            return Err(status_error(&bytes, &response_url, status));
        }
        let result: Value = serde_json::from_slice(&bytes).map_err(|_| invalid(
            "fatal: failed parsing http json response, please make sure the response is a valid json object"
        ))?;
        validate_removed(&result)?;
        Ok(result)
    }

    /// `Http.deleteViaCentralHub`: one endpoint receives all component IDs,
    /// each still versioned `@latest` as selected by `removeComponents`.
    pub async fn delete_hub(&self, url: &str, ids: &[String], force: bool) -> io::Result<Value> {
        self.delete_hub_ids(url, ids, force, false).await
    }

    /// `Http.deleteViaCentralHub` for lanes, with `laneIds` in its JSON body.
    pub async fn delete_hub_lanes(
        &self,
        url: &str,
        ids: &[String],
        force: bool,
    ) -> io::Result<Value> {
        self.delete_hub_ids(url, ids, force, true).await
    }

    async fn delete_hub_ids(
        &self,
        url: &str,
        ids: &[String],
        force: bool,
        lanes: bool,
    ) -> io::Result<Value> {
        let endpoint = format!("{}/api/delete", url.trim_end_matches('/'));
        let ids = serde_json::to_string(ids).map_err(io::Error::other)?;
        let body = if lanes {
            format!(r#"{{"laneIds":{ids}}}"#)
        } else {
            format!(r#"{{"componentIds":{ids}}}"#)
        };
        let options = format!(r#"{{"force":{force},"idsAreLanes":{lanes}}}"#);
        let response = self.single_delete_post(&endpoint, body, Some(&options)).await?;
        let status = response.status();
        let response_url = response.url().to_string();
        let bytes = self.delete_bytes(response).await?;
        let end = final_hub_line(&bytes)?;
        let Some(data) = end.get("data").filter(|data| tar::truthy(data)) else {
            return Err(io::Error::other(r#"HTTP results are missing "data" property"#));
        };
        if tar::truthy(&data["isError"]) {
            return Err(unexpected(end["message"].as_str().unwrap_or_default()));
        }
        if !status.is_success() {
            return Err(status_error(&[], &response_url, status));
        }
        validate_removed(data)?;
        Ok(data.clone())
    }

    async fn single_delete_post(
        &self,
        endpoint: &str,
        body: String,
        options: Option<&str>,
    ) -> io::Result<Response> {
        let mut request = self
            .headers(self.delete_client.post(endpoint), "write")?
            .header("Content-Type", "application/json")
            .body(body);
        if let Some(options) = options {
            request = request.header("delete-options", options);
        }
        // Do not call `Network::send`: it retries connection failures, while
        // a delete can already be committed when the connection closes.
        self.cancellation.run(request.send()).await?.map_err(|error| network_error(&error))
    }

    async fn delete_bytes(&self, response: Response) -> io::Result<Vec<u8>> {
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = self.cancellation.run(stream.next()).await? {
            let chunk = chunk.map_err(|error| network_error(&error))?;
            if chunk.len() > MAX_DELETE_BYTES - bytes.len() {
                return Err(invalid("remote delete response limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

fn final_hub_line(bytes: &[u8]) -> io::Result<Value> {
    let mut last = Value::Null;
    let mut count = 0;
    for line in bytes
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
    {
        count += 1;
        if count > MAX_DELETE_LINES {
            return Err(invalid("remote delete progress limit"));
        }
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let value: Value = serde_json::from_slice(line).map_err(io::Error::other)?;
        if tar::truthy(&value["end"]) {
            last = value;
        }
    }
    Ok(last)
}

fn validate_removed(result: &Value) -> io::Result<()> {
    let oversized = ["removedComponentIds", "missingComponents", "removedFromLane", "removedLanes"]
        .into_iter()
        .any(|key| {
            result[key]
                .as_array()
                .is_some_and(|rows| rows.len() > 4096)
        });
    if !result["removedComponentIds"].is_array()
        || !result["missingComponents"].is_array()
        || !result["dependentBits"].is_object()
        || oversized
    {
        return Err(invalid("remote delete result"));
    }
    Ok(())
}

fn status_error(bytes: &[u8], url: &str, status: reqwest::StatusCode) -> io::Error {
    let fallback = format!(
        "url: {url}. status: {}. text: {}",
        status.as_u16(),
        status.canonical_reason().unwrap_or_default(),
    );
    let parsed: Value = serde_json::from_slice(bytes).unwrap_or(Value::Null);
    let error = if parsed["error"]["code"].is_null() { &parsed } else { &parsed["error"] };
    let message = error["message"]
        .as_str()
        .map(str::trim)
        .filter(|msg| !msg.is_empty())
        .or_else(|| {
            parsed["message"]
                .as_str()
                .map(str::trim)
                .filter(|msg| !msg.is_empty())
        })
        .map_or_else(|| fallback.clone(), str::to_owned);
    remote_error(error["code"].as_u64(), error, url, message)
}
