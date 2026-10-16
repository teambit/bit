//! `Http.listLanes`: the limited remote GraphQL projection, including main.
use super::{Network, throw_for_status};
use crate::invalid;
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::io;

const LANES_QUERY: &str = "query Lanes($ids: [String!]) { lanes { list(ids: $ids) { id { name scope } components: laneComponentIds { name scope version } } } }";
const MAX_LANE_BYTES: usize = 4 * 1024 * 1024;

impl Network {
    pub async fn list_lanes(&self, url: &str, id: Option<&str>) -> io::Result<Vec<Value>> {
        let body = json!({"query": LANES_QUERY, "variables": {"ids": id.map(|id| vec![id])}});
        let endpoint = format!("{url}/graphql");
        let response = self.send(|| {
            self.headers(self.client.post(&endpoint), "read")
                .json(&body)
        })
        .await?;
        let response = throw_for_status(response).await?;
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(io::Error::other)?;
            if chunk.len() > MAX_LANE_BYTES.saturating_sub(bytes.len()) {
                return Err(invalid("remote lane response budget"));
            }
            bytes.extend_from_slice(&chunk);
        }
        let parsed: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
        if let Some(message) = parsed["errors"][0]["message"].as_str() {
            return Err(io::Error::other(message.to_owned()));
        }
        let lanes = parsed["data"]["lanes"]["list"]
            .as_array()
            .ok_or_else(|| invalid("remote lane list response"))?;
        if lanes.len() > 4096 {
            return Err(invalid("remote lane list count"));
        }
        lanes
            .iter()
            .map(lane_projection)
            .collect()
    }
}

fn lane_projection(lane: &Value) -> io::Result<Value> {
    let id = &lane["id"];
    let name = id["name"]
        .as_str()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("remote lane name"))?;
    let scope = id["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("remote lane scope"))?;
    let rows = lane["components"].as_array().ok_or_else(|| invalid("remote lane components"))?;
    if rows.len() > 4096 {
        return Err(invalid("remote lane component count"));
    }
    let components = rows
        .iter()
        .map(|row| {
            let scope = row["scope"]
                .as_str()
                .filter(|text| !text.is_empty())
                .ok_or_else(|| invalid("remote lane component scope"))?;
            let name = row["name"]
                .as_str()
                .filter(|text| !text.is_empty())
                .ok_or_else(|| invalid("remote lane component name"))?;
            let head = row["version"]
                .as_str()
                .filter(|text| !text.is_empty())
                .ok_or_else(|| invalid("remote lane component head"))?;
            Ok(json!({"id": format!("{scope}/{name}@{head}"), "head":head}))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(json!({"id":{"name":name,"scope":scope},"components":components}))
}
