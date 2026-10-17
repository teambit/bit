//! Shared scope/workspace/global transport precedence and resolver bootstrap.
use super::super::{Transport, invalid};
use bit_client_transfer::{GlobalConfig, http::Network, remotes::Remotes, resolver::Resolver};
use serde_json::Value;
use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

pub(super) fn connect(
    root: &Path,
    transport: &Transport,
) -> io::Result<(Remotes, Network, GlobalConfig, String)> {
    let home = PathBuf::from(
        env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default(),
    );
    with_home(root, transport, &home)
}

pub(super) fn with_home(
    root: &Path,
    transport: &Transport,
    home: &Path,
) -> io::Result<(Remotes, Network, GlobalConfig, String)> {
    let scope: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(root).join("scope.json"))?)
            .map_err(io::Error::other)?;
    let local = scope["name"].as_str().ok_or_else(|| invalid("inbound local scope"))?;
    let workspace = crate::effective_workspace_configuration(root, home)?;
    let global = bit_client_transfer::config::effective(
        global_config(transport)?,
        &scope["config"],
        &Value::Object(bit_workspace_config::workspace_values(&workspace)),
    );
    let resolver = Resolver::configured(
        &scope,
        transport.node_executable.clone(),
        transport.bit_dir.clone(),
        local,
        &global,
    );
    let remotes =
        Remotes::load(&scope, &transport.global_config_dir, &global)?.with_resolver(resolver);
    let network =
        Network::new(&global, &transport.bit_version, Some(local), transport.token.as_deref())?;
    Ok((remotes, network, global, local.to_owned()))
}

pub(super) fn global_config(transport: &Transport) -> io::Result<GlobalConfig> {
    serde_json::from_value(bit_workspace_config::read_global_config(&transport.global_config_dir)?)
        .map_err(io::Error::other)
}
