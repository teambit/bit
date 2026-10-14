//! The `http(s)` remote transport (`scopes/scope/network/http/http.ts`): `POST <url>/api/scope/fetch`
//! with a tar response, and symphony GraphQL for hub scope resolution.

use super::{fetch::FetchOptions, objects::invalid, tar::ObjectItem};
use crate::model::GlobalConfig;
use reqwest::{Certificate, Client, NoProxy, Proxy, RequestBuilder, Response};
use serde_json::{Value, json};
use std::{fs, io, time::Duration};

const CFG_USER_TOKEN: &str = "user.token";

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
    token: Option<String>,
    client_version: String,
    local_scope: Option<String>,
    retry: Retry,
}

impl Network {
    pub fn new(
        global: &GlobalConfig,
        client_version: &str,
        local_scope: Option<&str>,
    ) -> io::Result<Self> {
        let builder = proxy(Client::builder().connect_timeout(Duration::from_mins(1)), global)?;
        let client = tls(builder, global)?.build().map_err(io::Error::other)?;
        Ok(Self {
            client,
            token: config_str(global, CFG_USER_TOKEN).map(str::to_string),
            client_version: client_version.to_string(),
            local_scope: local_scope.map(str::to_string),
            retry: Retry::from_config(global),
        })
    }

    /// `Http.getHeaders()`.
    fn headers(&self, request: RequestBuilder, verb: &str) -> RequestBuilder {
        let request = request
            .header("x-verb", verb)
            .header("connection", "keep-alive")
            .header("x-client-version", &self.client_version);
        let request = match &self.token {
            Some(token) => request.header("Authorization", format!("Bearer {token}")),
            None => request,
        };
        match &self.local_scope {
            Some(scope) => request.header("x-request-scope", scope),
            None => request,
        }
    }

    /// POST a symphony GraphQL query.
    pub async fn graphql(&self, url: &str, body: &Value) -> io::Result<Value> {
        let response = self.send(|| {
            self.headers(self.client.post(url), "read")
                .json(body)
        })
        .await?;
        response.json().await.map_err(|_| invalid(&format!("fatal: failed parsing http json response, please make sure the response is a valid json object. url: {url}")))
    }

    /// `Http.fetch()`: the objects of `ids` as a tar of `[scope/]hash` entries.
    pub async fn fetch(
        &self,
        url: &str,
        ids: &[String],
        options: &FetchOptions,
    ) -> io::Result<Vec<ObjectItem>> {
        let endpoint = format!("{url}/api/scope/fetch");
        let body = json!({ "ids": ids, "fetchOptions": options });
        let response = self.send(|| {
            self.headers(self.client.post(&endpoint), "read")
                .json(&body)
        })
        .await?;
        let response = throw_for_status(response).await?;
        let bytes = response.bytes().await.map_err(|error| network_error(&error))?;
        super::tar::read(&bytes)
    }

    /// Retry network failures (not HTTP error statuses), like `retry(_fetch)`.
    async fn send(&self, request: impl Fn() -> RequestBuilder) -> io::Result<Response> {
        let mut attempt = 0;
        loop {
            match request().send().await {
                Ok(response) => return Ok(response),
                Err(error) if attempt >= self.retry.retries => return Err(network_error(&error)),
                Err(_) => {
                    tokio::time::sleep(self.retry.delay(attempt)).await;
                    attempt += 1;
                }
            }
        }
    }
}

/// `throwForNonOkStatus` with `remoteErrorHandler`'s messages.
async fn throw_for_status(response: Response) -> io::Result<Response> {
    if response.status().is_success() {
        return Ok(response);
    }
    let fallback = format!(
        "url: {}. status: {}. text: {}",
        response.url(),
        response.status().as_u16(),
        response
            .status()
            .canonical_reason()
            .unwrap_or_default(),
    );
    let url = response.url().to_string();
    let parsed: Value = response.json().await.unwrap_or(Value::Null);
    let error =
        if parsed["error"]["code"].is_null() { parsed.clone() } else { parsed["error"].clone() };
    let message = error["message"]
        .as_str()
        .or_else(|| parsed["message"].as_str())
        .map(str::to_string);
    Err(remote_error(error["code"].as_u64(), &error, &url, message.unwrap_or(fallback)))
}

fn remote_error(code: Option<u64>, error: &Value, url: &str, message: String) -> io::Error {
    let text = |key: &str| error[key].as_str().map_or_else(|| message.clone(), str::to_string);
    match code {
        Some(127) => io::Error::new(
            io::ErrorKind::NotFound,
            format!(r#"error: component "{}" was not found"#, text("id")),
        ),
        Some(128 | 130) => io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "error: permission to scope {url} was denied\nsee troubleshooting at https://legacy-docs.bit.dev/setup-authentication#authentication-issues",
            ),
        ),
        Some(129) => io::Error::new(
            io::ErrorKind::NotFound,
            format!(r#"error: remote scope "{}" was not found."#, text("name")),
        ),
        Some(132 | 133) => io::Error::other(message),
        _ => unexpected(&message),
    }
}

/// `UnexpectedNetworkError`.
fn unexpected(message: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::ConnectionAborted,
        format!("unexpected network error has occurred.\nserver responded with: \"{message}\""),
    )
}

fn network_error(error: &reqwest::Error) -> io::Error {
    unexpected(&error.to_string())
}

/// `Http.getProxyConfig()`: `proxy`, `https_proxy` (falls back to `proxy`), `proxy.no_proxy`.
fn proxy(
    builder: reqwest::ClientBuilder,
    global: &GlobalConfig,
) -> io::Result<reqwest::ClientBuilder> {
    let http = config_str(global, "proxy");
    let https = config_str(global, "https_proxy").or(http);
    let no_proxy = config_str(global, "proxy.no_proxy").and_then(NoProxy::from_string);
    let mut builder = builder;
    if let Some(url) = http {
        builder =
            builder.proxy(Proxy::http(url).map_err(io::Error::other)?.no_proxy(no_proxy.clone()));
    }
    if let Some(url) = https {
        builder = builder.proxy(Proxy::https(url).map_err(io::Error::other)?.no_proxy(no_proxy));
    }
    Ok(builder)
}

/// `strictSSL`, `ca` and `cafile` from `network.*` with the legacy `proxy.*` fallbacks.
fn tls(
    builder: reqwest::ClientBuilder,
    global: &GlobalConfig,
) -> io::Result<reqwest::ClientBuilder> {
    let strict = ["network.strict-ssl", "network.strict_ssl", "proxy.strict_ssl"]
        .iter()
        .find_map(|key| global.get(*key))
        .map(|value| {
            value
                .as_bool()
                .unwrap_or_else(|| value.as_str() == Some("true"))
        });
    let mut pem = config_str(global, "network.ca")
        .or_else(|| config_str(global, "proxy.ca"))
        .map(|ca| ca.as_bytes().to_vec());
    if pem.is_none()
        && let Some(file) =
            config_str(global, "network.cafile").or_else(|| config_str(global, "proxy.cafile"))
    {
        pem = Some(fs::read(file)?);
    }
    let builder = builder.tls_danger_accept_invalid_certs(strict == Some(false));
    let Some(pem) = pem else { return Ok(builder) };
    let certificates = Certificate::from_pem_bundle(&pem).map_err(io::Error::other)?;
    Ok(builder.tls_certs_merge(certificates))
}

fn config_str<'a>(global: &'a GlobalConfig, key: &str) -> Option<&'a str> {
    global
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}
