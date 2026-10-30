//! Retained installer Host requests and the scoped lane installation boundary.

use super::JsHost;
use crate::{
    commands::{status::cache::cache_root, workspace_command},
    host::Host,
    native::Outcome,
};
use bit_install::config::{WorkspaceConfig, load_global_config, scope_path};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path, sync::Arc};

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";

pub(super) fn outside_workspace(
    args: &[OsString],
    argv: &[String],
    cwd: &Path,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_none_or(|val| val.is_empty())
        && matches!(bit_install::options::parse(argv), Ok(bit_install::options::Parsed::Install(_)))
    {
        return workspace_command::execute_failure_scope(
            cwd,
            args,
            "install",
            false,
            "",
            io::Error::other(OUTSIDE_WORKSPACE_ERR),
        );
    }
    Ok(Outcome::Declined("not inside a workspace".to_string()))
}

pub(super) fn needs_canonical_install(root: &Path) -> bool {
    configured_root_aspects(root).unwrap_or(true)
}

fn configured_root_aspects(root: &Path) -> io::Result<bool> {
    let config = WorkspaceConfig::load(root)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let custom = |id: &str| {
        let base = bit_install::config::aspect_id_without_version(id);
        !core.iter().any(|core| core == base) && !bit_install::policy::is_core_env(base)
    };
    if config.aspects.keys().any(|id| custom(id)) || scope_custom_aspects(root, &custom)? {
        return Ok(true);
    }
    let global = load_global_config(&cache_root().join("config"))?;
    if global
        .keys()
        .any(|id| id.contains('/') && custom(id))
    {
        return Ok(true);
    }
    let raw = bit_install::jsonc::parse(&std::fs::read_to_string(&config.path)?)?;
    Ok(!raw["require"].is_null()
        && raw["require"] != false
        && raw["require"] != json!([])
        && raw["require"] != "")
}

fn scope_custom_aspects(root: &Path, custom: &impl Fn(&str) -> bool) -> io::Result<bool> {
    let path = scope_path(root).join("scope.jsonc");
    if !path.try_exists()? {
        return Ok(false);
    }
    let raw = bit_install::jsonc::parse(&std::fs::read_to_string(path)?)?;
    Ok(raw
        .as_object()
        .is_none_or(|entries| {
            entries
                .keys()
                .any(|id| id != "$schema" && id.contains('/') && custom(id))
        }))
}

pub(super) fn lane_installation() -> bool {
    let arguments = std::env::args()
        .skip(1)
        .take(2)
        .collect::<Vec<_>>();
    arguments
        .first()
        .is_some_and(|command| command == "switch")
        || arguments
            .first()
            .is_some_and(|command| command == "lane")
            && arguments
                .get(1)
                .is_some_and(|command| matches!(command.as_str(), "import" | "checkout" | "revert"))
}

impl JsHost {
    pub(in crate::commands) fn new(host: Arc<Host>, quiet: bool) -> Self {
        Self(host, quiet)
    }

    pub(super) async fn call<Response: DeserializeOwned>(
        &self,
        method: &'static str,
        params: Value,
    ) -> io::Result<Response> {
        let host = Arc::clone(&self.0);
        let value = tokio::task::spawn_blocking(move || host.call(method, &params))
            .await
            .map_err(io::Error::other)??;
        serde_json::from_value(value).map_err(io::Error::other)
    }
}

pub(super) async fn links_changed(host: &JsHost, ids: &[String]) -> io::Result<()> {
    if lane_installation() {
        host.call::<Value>("switchInstallationLinked", json!({ "ids": ids })).await?;
    }
    Ok(())
}

/// The `yesno` package: repeat until a yes or no answer; end of input is no.
pub(in crate::commands) fn confirm(question: &str) -> io::Result<bool> {
    use std::io::Write;
    let stdin = io::stdin();
    loop {
        print!("{question} ");
        io::stdout().flush()?;
        let mut line = String::new();
        if stdin.read_line(&mut line)? == 0 {
            return Ok(false);
        }
        match line
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "y" | "yes" => return Ok(true),
            "n" | "no" => return Ok(false),
            _ => println!("\nInvalid Response.\nAnswer either yes : (y, yes) \nOr no: (n, no) \n"),
        }
    }
}
