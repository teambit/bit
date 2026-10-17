//! `Http.doctor` projects diagnostic metadata without transferring scope objects.
use super::Network;
use crate::invalid;
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::io;

const QUERY: &str = concat!(include_str!("doctor.graphql"), "    ");
const MAX_BYTES: usize = 32 * 1024 * 1024;

impl Network {
    /// Request the published remote doctor's complete results and runtime metadata.
    pub async fn doctor(&self, url: &str, scope: &str, name: Option<&str>) -> io::Result<Value> {
        let mut variables = json!({});
        if let Some(name) = name {
            variables["diagnosisName"] = json!(name);
        }
        let query = QUERY.replace("\r\n", "\n");
        let request = self.client
            .post(format!("{url}/graphql"))
            .header("x-verb", "read");
        let request = match &self.token {
            Some(token) => request.header("authorization", format!("Bearer {token}")),
            None => request,
        };
        let request =
            request.json(&json!({"query":query,"variables":variables,"operationName":"doctor"}));
        let response = self.send(request).await?;
        let value = self.doctor_response(response).await?;
        projection(&value, scope)
    }

    async fn doctor_response(&self, response: reqwest::Response) -> io::Result<Value> {
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = self.cancellation.run(stream.next()).await? {
            let chunk = chunk.map_err(io::Error::other)?;
            if chunk.len() > MAX_BYTES - bytes.len() {
                return Err(invalid("remote doctor response limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(io::Error::other)
    }
}

fn projection(value: &Value, scope: &str) -> io::Result<Value> {
    if let Some(message) = value["errors"][0]["message"].as_str() {
        if message.contains(r#"Cannot query field "doctor""#) {
            return Err(io::Error::other(format!(
                r#"Remote scope "{scope}" does not support doctor checks. Please upgrade the remote scope to a newer version."#,
            )));
        }
        return Err(io::Error::other(message.to_owned()));
    }
    let result = &value["data"]["scope"]["doctor"];
    if result["examineResults"]
        .as_array()
        .is_none_or(|rows| rows.len() > 4096)
        || !result["metaData"].is_object()
    {
        return Err(invalid("remote doctor result"));
    }
    Ok(result.clone())
}
