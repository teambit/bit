//! `Http.pushToCentralHub`: scoped tar bytes and the exporter's NDJSON progress stream.
//!
//! Extends [`Network`] with [`Network::push_central`] to upload component archives and return [`HubReply`] events.
#[cfg(test)]
mod tests;

use super::{Network, network_error, unexpected};
use crate::invalid;
use futures_util::StreamExt;
use reqwest::{Response, StatusCode};
use serde_json::{Value, json};
use std::{io, time::Duration};

/// Maximum single NDJSON line length (`4 MiB`) accepted from `Http.pushToCentralHub`.
const MAX_LINE: usize = 4 * 1024 * 1024;
/// Maximum total response byte budget (`32 MiB`) accepted from `Http.pushToCentralHub`.
const MAX_RESPONSE: usize = 32 * 1024 * 1024;

/// Parsed response and progress messages returned by `Http.pushToCentralHub` ([`Network::push_central`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HubReply {
    /// Final acknowledgement JSON payload emitted in the `end` event.
    pub data: Value,
    /// Empty messages restart the caller's current loader text, as `loader.start(undefined)` does.
    pub messages: Vec<String>,
}

impl Network {
    /// The hub retries an identical object set three times via [`Network::push_central_observed`], unlike a direct scope upload.
    #[inline]
    pub async fn push_central(
        &self,
        url: &str,
        archive: Vec<u8>,
        objects_hash: &str,
        origin: &str,
    ) -> io::Result<HubReply> {
        self.push_central_observed(url, archive, objects_hash, origin, |_| {}).await
    }

    /// Observe each published loader restart while retaining the full acknowledgement receipt.
    pub async fn push_central_observed(
        &self,
        url: &str,
        archive: Vec<u8>,
        objects_hash: &str,
        origin: &str,
        mut observe: impl FnMut(&str),
    ) -> io::Result<HubReply> {
        let endpoint = format!("{}/api/put", url.trim().trim_end_matches('/'));
        let options = json!({"origin":origin.trim()}).to_string();
        let mut messages = Vec::new();
        let request = self
            .headers(self.client.post(&endpoint), "write")?
            .header("push-options", &options)
            .header("x-objects-hash", objects_hash.trim())
            .body(archive);
        for attempt in 0..=3 {
            messages.clear();
            let request =
                request.try_clone().ok_or_else(|| invalid("central hub request replay"))?;
            let result = async {
                let response = self.cancellation
                    .run(request.send())
                    .await?
                    .map_err(|error| network_error(&error))?;
                read(response, &self.cancellation, &mut messages, &mut observe).await
            }
            .await;
            match result {
                Ok((status, end)) => return finish(&endpoint, status, &end, messages),
                Err(error) if error.kind() == io::ErrorKind::Interrupted || attempt == 3 => {
                    return Err(error);
                }
                Err(_) => {
                    self.cancellation.run(tokio::time::sleep(Duration::from_millis(
                        5000 * (1 << attempt),
                    )))
                    .await?;
                }
            }
        }
        unreachable!("every final attempt returns")
    }
}

/// Stream the NDJSON progress [`Response`] from `Http.pushToCentralHub`, invoking `observe` on loader events.
async fn read(
    response: Response,
    cancellation: &crate::Cancellation,
    messages: &mut Vec<String>,
    observe: &mut impl FnMut(&str),
) -> io::Result<(StatusCode, Value)> {
    let status = response.status();
    let mut stream = response.bytes_stream();
    let mut pending = Vec::new();
    let mut total = 0usize;
    let mut end = Value::Null;
    while let Some(chunk) = cancellation.run(stream.next()).await? {
        let chunk = chunk.map_err(|error| network_error(&error))?;
        if chunk.len() > MAX_RESPONSE.saturating_sub(total) {
            return Err(invalid("central hub response exceeds bounds"));
        }
        total += chunk.len();
        accept_chunk(&chunk, &mut pending, &mut end, messages, observe)?;
    }
    if !pending.is_empty() {
        observed_line(&pending, &mut end, messages, observe)?;
    }
    Ok((status, end))
}

#[inline]
fn accept_chunk(
    mut chunk: &[u8],
    pending: &mut Vec<u8>,
    end: &mut Value,
    messages: &mut Vec<String>,
    observe: &mut impl FnMut(&str),
) -> io::Result<()> {
    while let Some(newline) = chunk
        .iter()
        .position(|&byte| byte == b'\n')
    {
        if pending.len() + newline > MAX_LINE {
            return Err(invalid("central hub response line exceeds bounds"));
        }
        pending.extend_from_slice(&chunk[..newline]);
        observed_line(pending, end, messages, observe)?;
        pending.clear();
        chunk = &chunk[newline + 1..];
    }
    if pending.len() + chunk.len() > MAX_LINE {
        return Err(invalid("central hub response line exceeds bounds"));
    }
    pending.extend_from_slice(chunk);
    Ok(())
}

#[inline]
fn observed_line(
    bytes: &[u8],
    end: &mut Value,
    messages: &mut Vec<String>,
    observe: &mut impl FnMut(&str),
) -> io::Result<()> {
    line(bytes, end, messages)?;
    if let Some(message) = messages.last() {
        observe(message);
    }
    Ok(())
}

#[inline]
fn line(bytes: &[u8], end: &mut Value, messages: &mut Vec<String>) -> io::Result<()> {
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    if bytes.is_empty() {
        return Ok(());
    }
    if messages.len() >= 16_384 {
        return Err(invalid("central hub progress line limit"));
    }
    let row: Value = serde_json::from_slice(bytes).map_err(io::Error::other)?;
    let message = row["message"]
        .as_str()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_owned)
        .or_else(|| messages.last().cloned())
        .unwrap_or_default();
    messages.push(message);
    if crate::tar::truthy(&row["end"]) {
        *end = row;
    }
    Ok(())
}

#[inline]
fn finish(
    url: &str,
    status: StatusCode,
    end: &Value,
    messages: Vec<String>,
) -> io::Result<HubReply> {
    if !crate::tar::truthy(&end["data"]) {
        return Err(io::Error::other(r#"HTTP results are missing "data" property"#));
    }
    if crate::tar::truthy(&end["data"]["isError"]) {
        let message = end["message"]
            .as_str()
            .or_else(|| end["data"]["message"].as_str())
            .map_or("", str::trim);
        return Err(unexpected(message));
    }
    if !status.is_success() {
        return Err(unexpected(&format!(
            "url: {url}. status: {}. text: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or_default(),
        )));
    }
    Ok(HubReply { data: end["data"].clone(), messages })
}
