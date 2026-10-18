//! Shared inbound request metadata; local eligibility never starts transport or providers.
use super::options::Options;
use crate::commands::{
    engine::Engine,
    status::cache::cache_root,
    workspace_command::{self, NodeCli},
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn prepare_into(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    ids: &[String],
) -> io::Result<Value> {
    prepare_into_with(engine, root, options, ids, false)
}
pub(super) fn prepare_into_with(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    ids: &[String],
    recovery: bool,
) -> io::Result<Value> {
    let mut request = request(root, options, ids)?;
    if recovery {
        request["options"]["recoveryLocal"] = json!(true);
    }
    if !options.objects_only {
        request["bitmapHistoryFileId"] = json!(workspace_command::file_id());
    }
    engine.request(&request)
}

pub(super) fn local_preflight(root: &Path, options: &Options) -> io::Result<()> {
    if options.validation_error().is_some() {
        return Ok(());
    }
    let mut request = request(root, options, &options.ids)?;
    request["kind"] = json!("commandInboundLocalPreflight");
    let response: Value = Engine::new()?.request(&request)?;
    if response["eligible"] != true {
        return Err(io::Error::other("native import local eligibility"));
    }
    Ok(())
}
fn request(root: &Path, options: &Options, ids: &[String]) -> io::Result<Value> {
    let cli = NodeCli::find()?;
    let config = cache_root().join("config");
    Ok(json!({
        "kind": "commandInboundPrepare",
        "root": root,
        "home": workspace_command::home(),
        "globalRemotesFile": config.join("global-remotes.json"),
        "globalConfigDir": config,
        "nodeExecutable": cli.node,
        "bitDir": cli.bit_dir,
        "bitVersion": cli.version,
        "operation": options.operation,
        "ids": ids,
        "options": options.request(),
    }))
}
