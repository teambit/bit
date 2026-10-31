//! Scalar published remote resolution for read-only native inventory.
use super::{color::Chalk, status::cache::cache_root};
use crate::{
    discovery::{self, Target},
    host::Host,
};
use bit_client_transfer::{GlobalConfig, remotes::Remotes};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    env,
    ffi::OsString,
    fs::File,
    io::{self, Read},
    path::{Path, PathBuf},
};

const MAX_SCOPE_CONFIG: u64 = 1024 * 1024;

/// One CLI command's resolver callbacks and their observable output.
pub(super) struct Session {
    root: Option<PathBuf>,
    bare_scope_root: Option<PathBuf>,
    args: Vec<OsString>,
    host: Option<Host>,
    overrides: HashMap<String, String>,
    output: String,
    warning: Option<String>,
    owned: bool,
}

impl Session {
    pub(super) fn new(root: Option<&Path>, args: &[OsString]) -> Self {
        Self {
            root: root.map(Path::to_path_buf),
            bare_scope_root: None,
            args: args.to_vec(),
            host: None,
            overrides: HashMap::new(),
            output: String::new(),
            warning: None,
            owned: false,
        }
    }

    pub(super) fn for_scope(scope_root: &Path, args: &[OsString]) -> Self {
        Self {
            root: None,
            bare_scope_root: Some(scope_root.to_owned()),
            args: args.to_vec(),
            host: None,
            overrides: HashMap::new(),
            output: String::new(),
            warning: None,
            owned: false,
        }
    }

    pub(super) fn owned(&self) -> bool {
        self.owned
    }

    pub(super) fn output(&self) -> &str {
        &self.output
    }

    pub(super) fn warning(&self) -> Option<&str> {
        self.warning.as_deref()
    }

    pub(super) fn overrides(&self) -> &HashMap<String, String> {
        &self.overrides
    }

    pub(super) fn add_warning(&mut self, warning: &str) {
        self.owned = true;
        self.warning = Some(warning.to_owned());
    }

    pub(super) fn resolve(&mut self, scopes: &[String]) -> io::Result<()> {
        let (remotes, custom) = self.plan()?;
        let pending = scopes
            .iter()
            .map(|scope| scope.trim())
            .filter(|scope| !scope.is_empty() && !self.overrides.contains_key(*scope))
            .filter_map(|scope| match remotes.configured(scope) {
                Ok(Some(_)) => None,
                Ok(None) if custom => Some(Ok(scope.to_owned())),
                Ok(None) => None,
                Err(error) => Some(Err(error)),
            })
            .collect::<io::Result<Vec<_>>>()?;
        if !pending.is_empty() && env::var_os("CI").is_some_and(|value| !value.is_empty()) {
            return Err(io::Error::other(CiResolverDecline));
        }
        for scope in pending {
            self.resolve_custom(&scope)?;
        }
        Ok(())
    }

    fn plan(&self) -> io::Result<(Remotes, bool)> {
        let config_dir = cache_root().join("config");
        let global: GlobalConfig =
            serde_json::from_value(bit_workspace_config::read_global_config(&config_dir)?)
                .map_err(io::Error::other)?;
        let scope = self.root
            .as_ref()
            .map(|root| read_scope(root, false))
            .transpose()?
            .or(self.bare_scope_root
                .as_ref()
                .map(|root| read_scope(root, true))
                .transpose()?)
            .unwrap_or(Value::Null);
        let custom = scope["resolverPath"]
            .as_str()
            .is_some_and(|path| !path.trim().is_empty());
        Ok((Remotes::load(&scope, &config_dir, &global)?, custom))
    }

    fn resolve_custom(&mut self, scope: &str) -> io::Result<()> {
        // Callback ownership starts before the retained host can run user code.
        self.owned = true;
        let params = json!({
            "scope": scope, "workspace": self.root.is_some(),
            "bareScopeRoot": self.bare_scope_root.as_ref(),
        });
        let result = self.host()?.call("inventoryResolve", &params);
        if let Some(host) = &self.host {
            self.output.push_str(&host.take_stdout());
        }
        let receipt = result?;
        if let Some(error) = receipt
            .get("error")
            .filter(|err| !err.is_null())
        {
            let message = error["message"]
                .as_str()
                .or_else(|| error.as_str())
                .map(str::trim)
                .filter(|msg| !msg.is_empty())
                .unwrap_or("remote resolver failed");
            return Err(io::Error::other(message.to_owned()));
        }
        let url = receipt["host"]
            .as_str()
            .map(str::trim)
            .filter(|url| !url.is_empty())
            .ok_or_else(|| io::Error::other("remote resolver host receipt"))?;
        bit_client_transfer::remotes::Remote::from_host(url)?;
        self.overrides.insert(scope.to_owned(), url.to_owned());
        Ok(())
    }

    fn host(&mut self) -> io::Result<&Host> {
        if self.host.is_none() {
            let Target::Entry(cli) = discovery::find()? else {
                return Err(io::Error::other("the published resolver host is unavailable"));
            };
            let root = self.root
                .clone()
                .or_else(|| self.bare_scope_root.clone())
                .unwrap_or(env::current_dir()?);
            self.host = Some(Host::new(cli, root, Chalk::detect(&self.args).enabled()));
        }
        Ok(self.host.as_ref().unwrap())
    }
}

fn read_scope(root: &Path, bare: bool) -> io::Result<Value> {
    let mut bytes = Vec::new();
    let scope = if bare { root.to_owned() } else { bit_object_import::scope_path(root) };
    File::open(scope.join("scope.json"))?
        .take(MAX_SCOPE_CONFIG + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_SCOPE_CONFIG {
        return Err(io::Error::other("remote resolver scope configuration limit"));
    }
    serde_json::from_slice(&bytes).map_err(io::Error::other)
}

#[derive(Debug)]
struct CiResolverDecline;
impl std::fmt::Display for CiResolverDecline {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CI custom resolver errors need the published JavaScript stack")
    }
}
impl std::error::Error for CiResolverDecline {}

pub(super) fn is_ci_decline(error: &io::Error) -> bool {
    error.get_ref().is_some_and(<dyn std::error::Error + Send + Sync>::is::<CiResolverDecline>)
}
