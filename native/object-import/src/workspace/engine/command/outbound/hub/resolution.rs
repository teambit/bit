use super::{Prepare, invalid};
use bit_client_transfer::{
    GlobalConfig,
    http::Network,
    remotes::{Remote, Remotes},
    resolver::Resolver,
};
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[derive(Clone)]
pub(in super::super) struct Resolved {
    pub host: String,
    pub hub: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in super::super) struct Resolution {
    global_remotes_file: PathBuf,
    #[serde(default, rename = "skipRemoteResolution")]
    preflight_only: bool,
    #[serde(skip)]
    resolved_hosts: Mutex<HashMap<String, Resolved>>,
}

impl Resolution {
    pub(in super::super) fn preflight(&self) -> bool {
        self.preflight_only
    }
    pub(in super::super) fn globals_path(&self) -> &Path {
        &self.global_remotes_file
    }
    fn configured(&self, local: &Value, scope: &str) -> io::Result<Option<String>> {
        if let Some(host) = local["remotes"][scope].as_str() {
            return Ok(Some(host.to_owned()));
        }
        let globals: Value = match fs::read(&self.global_remotes_file) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
            Err(error) => return Err(error),
        };
        Ok(globals[scope].as_str().map(str::to_owned))
    }
    fn cache(&self) -> io::Result<std::sync::MutexGuard<'_, HashMap<String, Resolved>>> {
        self.resolved_hosts.lock().map_err(|_| invalid("outbound remote cache"))
    }
}

pub(in super::super) fn resolve(input: &Prepare, scope: &str) -> io::Result<Resolved> {
    if let Some(resolved) = input.resolution.cache()?.get(scope) {
        return Ok(resolved.clone());
    }
    let local: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(&input.root).join("scope.json"))?)?;
    let resolved = match input.resolution.configured(&local, scope)? {
        Some(host) => Resolved { host, hub: false },
        None if input.resolution.preflight() => {
            Resolved { host: "https://native-preflight.invalid".into(), hub: true }
        }
        None => Resolved { host: resolve_hub(input, &local, scope)?, hub: true },
    };
    input.resolution.cache()?.insert(scope.to_owned(), resolved.clone());
    Ok(resolved)
}

fn resolve_hub(input: &Prepare, local: &Value, scope: &str) -> io::Result<String> {
    let global = global(input)?;
    let name = local["name"].as_str().ok_or_else(|| invalid("outbound local scope"))?;
    let resolver = Resolver::configured(
        local,
        input.transport.node_executable.clone(),
        input.transport.bit_dir.clone(),
        name,
        &global,
    );
    let remotes =
        Remotes::load(local, &input.transport.global_config_dir, &global)?.with_resolver(resolver);
    let network = Network::new(
        &global,
        &input.transport.bit_version,
        Some(name),
        input.transport.token.as_deref(),
    )?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    match runtime.block_on(remotes.resolve(scope, &network))? {
        Remote::File(path) => Ok(format!("file://{}", path.display())),
        Remote::Http(url) => Ok(url),
    }
}

pub(in super::super) fn global(input: &Prepare) -> io::Result<GlobalConfig> {
    let global = match fs::read(input.transport.global_config_dir.join("config.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => GlobalConfig::new(),
        Err(error) => return Err(error),
    };
    let scope: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(&input.root).join("scope.json"))?)?;
    let workspace =
        crate::workspace::engine::effective_workspace_configuration(&input.root, &input.home)?;
    Ok(bit_client_transfer::config::effective(
        global,
        &scope["config"],
        &workspace["teambit.harmony/config-store"],
    ))
}
