//! Remote scope resolution (`getScopeRemotes` and the hub `remoteResolver`).

use crate::{GlobalConfig, http::Network, invalid, resolver::Resolver};
use indexmap::IndexMap;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
};

/// [`GLOBAL_REMOTES`] in `GLOBAL_CONFIG`.
const GLOBAL_REMOTES: &str = "global-remotes.json";
const CFG_CLOUD_DOMAIN: &str = "cloud_domain";
const CFG_SYMPHONY_URL: &str = "symphony_url";

/// The remotes this process resolved, by [`Remotes::cache_key`].
static RESOLVED: LazyLock<Mutex<HashMap<String, Remote>>> = LazyLock::new(Mutex::default);
const DEFAULT_CLOUD_DOMAIN: &str = "bit.cloud";

/// Where a remote scope lives.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Remote {
    /// `file://<path>`: a bare scope on disk.
    File(PathBuf),
    /// `http(s)://<url>`.
    Http(String),
}

impl Remote {
    /// `connect()` in `network-lib.ts`.
    pub fn from_host(host: &str) -> io::Result<Self> {
        if host.starts_with("ssh://") || host.starts_with("bit://") {
            return Err(invalid(
                "ssh protocol is not supported anymore, please use http or fs protocols",
            ));
        }
        if let Some(path) = host.strip_prefix("file://") {
            return Ok(Self::File(PathBuf::from(path)));
        }
        if host.starts_with("http://") || host.starts_with("https://") {
            return Ok(Self::Http(host.trim_end_matches('/').to_string()));
        }
        Err(invalid(
            "error: remote scope protocol is not supported, please use: `file://`, `http://`, `https://`",
        ))
    }
}

/// The remotes a workspace scope knows: `scope.json` remotes over the global remotes.
pub struct Remotes {
    hosts: IndexMap<String, String>,
    symphony: String,
    /// `scope.json` `resolverPath`: replaces the hub lookup.
    resolver: Option<Resolver>,
}

impl Remotes {
    pub fn load(
        scope_json: &Value,
        global_config_dir: &Path,
        global: &GlobalConfig,
    ) -> io::Result<Self> {
        let mut hosts = global_remotes(global_config_dir)?;
        if let Some(remotes) = scope_json["remotes"].as_object() {
            for (name, host) in remotes {
                if let Some(host) = host.as_str() {
                    hosts.insert(name.clone(), host.to_string());
                }
            }
        }
        Ok(Self { hosts, symphony: symphony_url(global), resolver: None })
    }

    /// Resolve scopes without a configured remote through `resolver` instead of the hub.
    #[must_use]
    pub fn with_resolver(mut self, resolver: Option<Resolver>) -> Self {
        self.resolver = resolver;
        self
    }

    /// `Remotes.resolve`.
    pub async fn resolve(&self, scope: &str, network: &Network) -> io::Result<Remote> {
        if let Some(host) = self.hosts.get(scope) {
            return Remote::from_host(host);
        }
        let key = self.cache_key(scope);
        if let Some(remote) = RESOLVED
            .lock()
            .map_err(|_| invalid("remotes poisoned"))?
            .get(&key)
        {
            return Ok(remote.clone());
        }
        let remote = match &self.resolver {
            Some(resolver) => Remote::from_host(&resolver.resolve(scope).await?)?,
            None => self.resolve_from_hub(scope, network).await?,
        };
        RESOLVED
            .lock()
            .map_err(|_| invalid("remotes poisoned"))?
            .insert(key, remote.clone());
        Ok(remote)
    }

    /// One resolution per scope, hub and resolver for the whole process: a command
    /// builds a `Remotes` per step (`bit import` lists, then fetches).
    fn cache_key(&self, scope: &str) -> String {
        let resolver =
            self.resolver.as_ref().map_or("", |resolver| resolver.path.as_str());
        format!("{}\0{resolver}\0{scope}", self.symphony)
    }

    /// `hubResolver`: ask symphony for the scope's API url.
    async fn resolve_from_hub(&self, scope: &str, network: &Network) -> io::Result<Remote> {
        let query = "query GET_SCOPE($id: String!) { getScope(id: $id) { isLegacy apis { url } } }";
        let body = json!({ "query": query, "variables": { "id": scope } });
        let response = network.graphql(&format!("{}/graphql", self.symphony), &body).await?;
        if let Some(message) = response["errors"][0]["message"].as_str() {
            if message == "access denied" {
                return Err(not_found_or_denied(scope));
            }
            return Err(io::Error::other(format!("{scope}: {message}")));
        }
        let found = &response["data"]["getScope"];
        match (found["isLegacy"].as_bool(), found["apis"]["url"].as_str()) {
            (Some(false), Some(url)) => Remote::from_host(url),
            _ => Err(invalid(
                "ssh protocol is not supported anymore, please use http or fs protocols",
            )),
        }
    }
}

/// `ScopeNotFoundOrDenied`.
#[must_use]
pub fn not_found_or_denied(scope: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::NotFound,
        format!(
            r#"unable to find the remote scope "{scope}" or you don't have access to this scope, please make sure you are logged in"#,
        ),
    )
}

pub fn global_remotes(dir: &Path) -> io::Result<IndexMap<String, String>> {
    match fs::read(dir.join(GLOBAL_REMOTES)) {
        Ok(bytes) => Ok(serde_json::from_slice::<IndexMap<String, Value>>(&bytes)
            .map_err(|_| invalid("invalid global-remotes.json"))?
            .into_iter()
            .filter_map(|(name, host)| Some((name, host.as_str()?.to_string())))
            .collect()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(IndexMap::new()),
        Err(error) => Err(error),
    }
}

/// `getSymphonyUrl()`.
#[must_use]
pub fn symphony_url(global: &GlobalConfig) -> String {
    if let Some(url) = global.get(CFG_SYMPHONY_URL).and_then(Value::as_str) {
        return if url.starts_with("http") { url.to_string() } else { format!("https://{url}") };
    }
    let domain = global
        .get(CFG_CLOUD_DOMAIN)
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_CLOUD_DOMAIN);
    let host = if domain == DEFAULT_CLOUD_DOMAIN {
        format!("api.v2.{domain}")
    } else {
        format!("api.{domain}")
    };
    if host.starts_with("http") { host } else { format!("https://{host}") }
}
