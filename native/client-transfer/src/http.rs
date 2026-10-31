//! The `http(s)` remote transport (`scopes/scope/network/http/http.ts`): `POST <url>/api/scope/fetch`
//! with a tar response, `POST <url>/graphql` for the remote scope's component list, and
//! symphony GraphQL for hub scope resolution.

pub use action_errors::{LaneNotFound, action_conflict, is_action_not_found};
pub use hub::HubReply;
pub use inventory::old_server_fallback;

mod action_errors;
mod configuration;
mod delete;
mod doctor;
mod hub;
mod inventory;
mod lane;
mod stream;

use action_errors::{
    network_error, remote_error, throw_for_action_status, throw_for_status, unexpected,
};
use configuration::{config_str, proxy, sockets, tls};

use crate::{Cancellation, GlobalConfig, fetch::FetchOptions, invalid, tar::ObjectItem};
use reqwest::{Client, RequestBuilder, Response, redirect::Policy};
use serde_json::{Value, json};
use std::{io, time::Duration};

const CFG_USER_TOKEN: &str = "user.token";
/// `@pnpm/node-fetch`'s default. bit.cloud's edge answers requests without
/// a `User-Agent` with a 403 challenge page.
const USER_AGENT: &str = "node-fetch";

/// The query `listBackwardCompatible` sends.
const LIST_QUERY: &str = "query list($namespaces: [String!]) { scope { components(namespaces: $namespaces) { id { scope version name } deprecation { isDeprecate } } } }";

/// One component of a remote `list`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Listed {
    pub scope: String,
    pub name: String,
    pub version: Option<String>,
    pub deprecated: bool,
}

impl Listed {
    fn parse(component: &Value) -> io::Result<Self> {
        let id = &component["id"];
        let text = |key: &str| {
            id[key]
                .as_str()
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        };
        let (Some(scope), Some(name)) = (text("scope"), text("name")) else {
            return Err(invalid("remote list component id"));
        };
        Ok(Self {
            scope,
            name,
            version: text("version"),
            deprecated: component["deprecation"]["isDeprecate"] == true,
        })
    }

    /// `ComponentID.toString()`.
    #[must_use]
    pub fn id(&self) -> String {
        match &self.version {
            Some(version) => format!("{}/{}@{version}", self.scope, self.name),
            None => format!("{}/{}", self.scope, self.name),
        }
    }
}

/// `Http.getNetworkConfig()` retry defaults.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Retry {
    pub retries: u32,
    pub factor: u32,
    pub min_timeout: u64,
    pub max_timeout: u64,
}

impl Retry {
    fn from_config(global: &GlobalConfig) -> Self {
        let number = |key: &str, default: u64| {
            config_str(global, key)
                .and_then(|value| value.parse().ok())
                .unwrap_or(default)
        };
        Self {
            retries: u32::try_from(number("network.fetch_retries", 5)).unwrap_or(5),
            factor: u32::try_from(number("network.fetch_retry_factor", 10)).unwrap_or(10),
            min_timeout: number("network.fetch_retry_mintimeout", 1000),
            max_timeout: number("network.fetch_retry_maxtimeout", 60_000),
        }
    }

    /// `p-retry` (`retry`) delay before attempt `attempt + 1`.
    #[must_use]
    pub fn delay(&self, attempt: u32) -> Duration {
        let factor = u64::from(self.factor).saturating_pow(attempt);
        Duration::from_millis(self.min_timeout.saturating_mul(factor).min(self.max_timeout))
    }
}

/// The client every HTTP remote request goes through.
pub struct Network {
    client: Client,
    delete_client: Client,
    token: Option<String>,
    client_version: String,
    local_scope: Option<String>,
    retry: Retry,
    cancellation: Cancellation,
}

impl Network {
    /// Attach the operation's cancellation owner before issuing any remote request.
    #[must_use]
    pub fn with_cancellation(mut self, cancellation: Cancellation) -> Self {
        self.cancellation = cancellation;
        self
    }

    /// Run a canonical scope server action. Unlike fetch, Bit's `Http.action`
    /// makes a single request; export persistence retries at the caller level.
    pub async fn action(&self, url: &str, name: &str, options: &Value) -> io::Result<Value> {
        let endpoint = format!("{url}/api/scope/action");
        let body = json!({"name": name, "options": options});
        let response = self.cancellation
            .run(
                self.headers(self.client.post(&endpoint), "write")?
                    .json(&body)
                    .send(),
            )
            .await?
            .map_err(|error| network_error(&error))?;
        let response = self.cancellation.run(throw_for_action_status(response)).await??;
        self.cancellation.run(response.json()).await?.map_err(|_| {
            invalid(&format!(
                "fatal: failed parsing http json response, please make sure the response is a valid json object. url: {endpoint}",
            ))
        })
    }

    /// POST compressed objects to a remote pending directory. Validation and
    /// persistence are separate server actions, preserving export recovery.
    pub async fn push(
        &self,
        url: &str,
        client_id: &str,
        archive: Vec<u8>,
    ) -> io::Result<Vec<String>> {
        let endpoint = format!("{url}/api/scope/put");
        let options = json!({"clientId":client_id}).to_string();
        let response = self.cancellation
            .run(
                self.headers(self.client.post(&endpoint), "write")?
                    .header("push-options", &options)
                    .body(archive)
                    .send(),
            )
            .await?
            .map_err(|error| network_error(&error))?;
        let response = self.cancellation.run(throw_for_status(response)).await??;
        self.cancellation.run(response.json()).await?.map_err(io::Error::other)
    }
    /// `token` is the `--token` flag, which wins over `user.token`.
    pub fn new(
        global: &GlobalConfig,
        client_version: &str,
        local_scope: Option<&str>,
        token: Option<&str>,
    ) -> io::Result<Self> {
        let global = crate::config::effective(global.clone(), &Value::Null, &Value::Null);
        let global = &global;
        let configured = |builder| {
            let builder = sockets(builder, global)?;
            let builder = proxy(builder, global)?;
            tls(builder, global)?.build().map_err(io::Error::other)
        };
        let client = configured(Client::builder().user_agent(USER_AGENT))?;
        // A 307/308 redirect can repeat a POST after the original delete was
        // committed. Keep redirects disabled only for mutation-by-delete.
        let delete_client = configured(
            Client::builder()
                .user_agent(USER_AGENT)
                .redirect(Policy::none()),
        )?;
        Ok(Self {
            client,
            delete_client,
            token: token
                .filter(|token| !token.is_empty())
                .or_else(|| config_str(global, CFG_USER_TOKEN))
                .map(str::to_string),
            client_version: client_version.to_string(),
            local_scope: local_scope.map(str::to_string),
            retry: Retry::from_config(global),
            cancellation: Cancellation::current(),
        })
    }

    /// `Http.getHeaders()`.
    fn headers(&self, request: RequestBuilder, verb: &str) -> io::Result<RequestBuilder> {
        let request = request
            .header("x-verb", verb)
            .header("connection", "keep-alive")
            .header("x-client-version", &self.client_version)
            .header("x-request-id", request_id()?);
        let request = match &self.token {
            Some(token) => request.header("Authorization", format!("Bearer {token}")),
            None => request,
        };
        let request = match std::env::var("__CUSTOM_ORIGIN") {
            Ok(origin) if !origin.is_empty() => request.header("x-custom-origin", origin),
            _ => request,
        };
        Ok(match &self.local_scope {
            Some(scope) => request.header("x-request-scope", scope),
            None => request,
        })
    }

    /// POST a symphony GraphQL query.
    pub async fn graphql(&self, url: &str, body: &Value) -> io::Result<Value> {
        let response = self.send(
            self.headers(self.client.post(url), "read")?
                .json(body),
        )
        .await?;
        self.cancellation.run(response.json()).await?.map_err(|_| invalid(&format!("fatal: failed parsing http json response, please make sure the response is a valid json object. url: {url}")))
    }

    /// `Http.fetch()`: the objects of `ids` as a tar of `[scope/]hash` entries.
    pub async fn fetch(
        &self,
        url: &str,
        ids: &[String],
        options: &FetchOptions,
    ) -> io::Result<Vec<ObjectItem>> {
        self.fetch_bounded(url, ids, options, super::tar::MAX_ARCHIVE_BYTES).await
    }

    /// Use a tighter response ceiling for workspace commands that retain the
    /// remote objects until a separate publication step.
    pub async fn fetch_bounded(
        &self,
        url: &str,
        ids: &[String],
        options: &FetchOptions,
        max_bytes: usize,
    ) -> io::Result<Vec<ObjectItem>> {
        let endpoint = format!("{url}/api/scope/fetch");
        let body = json!({ "ids": ids, "fetchOptions": options });
        let mut bytes = [0; 4];
        getrandom::fill(&mut bytes).map_err(|error| io::Error::other(error.to_string()))?;
        let request_id = u32::from_ne_bytes(bytes) % 1_000_000;
        let request = self
            .headers(self.client.post(&endpoint), "read")?
            .header("x-bit-request-id", request_id.to_string())
            .json(&body);
        let response = self.send(request).await?;
        let response = self.cancellation.run(throw_for_status(response)).await??;
        stream::read(response, max_bytes, &self.cancellation).await
    }

    /// `Http.list()` without deleted components (`listBackwardCompatible`): the
    /// remote scope's components whose names match `namespaces`, matched by the
    /// remote, with their head versions and deprecation.
    pub async fn list(&self, url: &str, namespaces: Option<&str>) -> io::Result<Vec<Listed>> {
        let body = json!({
            "query": LIST_QUERY,
            "variables": { "namespaces": namespaces.map(|namespaces| [namespaces]) },
        });
        let endpoint = format!("{url}/graphql");
        let response = self.send(
            self.headers(self.client.post(&endpoint), "read")?
                .json(&body),
        )
        .await?;
        let response = self.cancellation.run(throw_for_status(response)).await??;
        let parsed: Value = self.cancellation.run(response.json()).await?.map_err(|_| {
            invalid(&format!("fatal: failed parsing http json response, please make sure the response is a valid json object. url: {endpoint}"))
        })?;
        if let Some(message) = parsed["errors"][0]["message"].as_str() {
            return Err(io::Error::other(message.to_string()));
        }
        parsed["data"]["scope"]["components"]
            .as_array()
            .ok_or_else(|| invalid("remote list response"))?
            .iter()
            .map(Listed::parse)
            .collect()
    }

    /// Retry network failures (not HTTP error statuses), like `retry(_fetch)`.
    async fn send(&self, request: RequestBuilder) -> io::Result<Response> {
        let mut attempt = 0;
        loop {
            let request = request
                .try_clone()
                .ok_or_else(|| invalid("remote request body cannot be replayed"))?;
            match self.cancellation.run(request.send()).await? {
                Ok(response) => return Ok(response),
                Err(error) if attempt >= self.retry.retries => return Err(network_error(&error)),
                Err(_) => {
                    self.cancellation.run(tokio::time::sleep(self.retry.delay(attempt))).await?;
                    attempt += 1;
                }
            }
        }
    }
}

#[cfg(test)]
mod action_tests;
#[cfg(test)]
mod fetch_tests;
#[cfg(test)]
mod list_tests;
mod log;
#[cfg(test)]
mod push_tests;
#[cfg(test)]
mod status_tests;
#[cfg(test)]
mod tls_tests;

fn request_id() -> io::Result<String> {
    let mut bytes = [0; 16];
    getrandom::fill(&mut bytes).map_err(|error| io::Error::other(error.to_string()))?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const HEX: &[u8] = b"0123456789abcdef";
    let hex = bytes
        .into_iter()
        .flat_map(|byte| {
            [char::from(HEX[usize::from(byte >> 4)]), char::from(HEX[usize::from(byte & 15)])]
        })
        .collect::<String>();
    Ok(format!("{}-{}-{}-{}-{}", &hex[..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..]))
}
