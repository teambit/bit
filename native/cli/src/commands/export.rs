//! Native `bit export` of the staged components on main (`ExportCmd` with
//! `exportMany`): the engine selects the objects, pushes them to each
//! configured remote, validates and persists them there, then publishes the
//! local bookkeeping (`commandOutboundPrepare`, `commandOutboundApply`,
//! `commandOutboundFinalize`).
//!
//! The remotes change only when they persist the objects. A failure before
//! that leaves them as they were (the pushed objects are cleaned), so the
//! command declines and the Node.js CLI exports and reports. Ids, `--resume`,
//! lanes and bit.cloud (hub) remotes run on the Node.js CLI.

mod report;

use super::{
    color::Chalk,
    engine::Engine,
    status::cache::cache_root,
    workspace_command::{self, NodeCli, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fmt::Write,
    io,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub const COMMAND: Command = Command { name: "export", aliases: &["e"], run };

/// `--origin-directly`, the only flag that runs natively.
fn parse(args: &[&str]) -> Option<bool> {
    match args {
        [] => Some(false),
        ["--origin-directly"] => Some(true),
        _ => None,
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(arguments) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("the arguments are not UTF-8".to_string()));
    };
    let Some(origin_directly) = parse(&arguments[1..]) else {
        return Ok(Outcome::Declined("ids or flags outside the native export".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let exported = match export(&root, origin_directly) {
        Ok(exported) => exported,
        Err(error) => return Ok(Outcome::Declined(format!("export: {error}"))),
    };
    let chalk = Chalk::detect(args);
    let data = match &exported.result {
        Ok(receipt) => report::format(receipt, chalk),
        Err(_) => String::new(),
    };
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with(&root, args, "export", &report, |output| {
        exported.progress(output);
        exported.result
            .as_ref()
            .map(|_| ())
            .map_err(|error| io::Error::other(error.clone()))
    })
}

/// What the export did: the loader's lines and the receipt, or the error of
/// a remote that failed to persist.
struct Exported {
    count: usize,
    pending: bool,
    /// Each scope and the number of objects pushed to it.
    transfers: Vec<(String, usize)>,
    /// The scopes persisted, the last one the failed one on failure.
    persisted: Vec<String>,
    result: Result<Value, String>,
}

impl Exported {
    /// `exportMany`'s status lines (`exportPendingComponents` without ids).
    fn progress(&self, output: &Output) {
        output.status("loading components");
        output.status(if self.count > 1 { "exporting components" } else { "exporting component" });
        if !self.pending {
            return;
        }
        for (scope, objects) in &self.transfers {
            output.status(&format!(r#"transferring {objects} objects to the remote "{scope}"..."#));
        }
        output.restart("verifying that objects can be merged on the remotes...");
        for scope in &self.persisted {
            output.restart(&format!(r#"persisting data on the remote "{scope}"..."#));
        }
        if self.result.is_ok() {
            output.status("updating data locally...");
        }
    }
}

/// Prepare, transfer and publish. An error is a decline: nothing changed
/// on the remotes.
fn export(root: &Path, origin_directly: bool) -> io::Result<Exported> {
    let mut engine = Engine::new()?;
    let prepared = prepare(&mut engine, root, origin_directly)?;
    let token = prepared.token.clone();
    let mut exported = Exported {
        count: prepared.count,
        pending: !prepared.nothing_to_export,
        transfers: prepared.transfers,
        persisted: prepared.scopes.clone(),
        result: Err(String::new()),
    };
    match engine.request::<Value>(&json!({"kind": "commandOutboundApply", "token": token})) {
        // `commandOutboundApply` transfers exactly when something is exported.
        Ok(applied)
            if applied["token"] != token.as_str() || applied["pending"] != exported.pending =>
        {
            exported.result = Err("native outbound pending receipt".to_string());
            return Ok(exported);
        }
        Ok(_) => {}
        Err(error) => {
            // Only a failed persist changed a remote: report it like `PersistFailed`.
            let failure = persist_failure(&error.to_string(), &prepared.scopes).ok_or(error)?;
            exported.persisted.truncate(failure.0 + 1);
            exported.result = Err(failure.1);
            return Ok(exported);
        }
    }
    let finalized =
        engine.request::<Value>(&json!({"kind": "commandOutboundFinalize", "token": token}));
    exported.result = finalized
        .and_then(|finalized| report::published(&finalized, &token))
        .map_err(|error| error.to_string());
    Ok(exported)
}

/// `commandOutboundPrepare` of the staged components, as the Node.js CLI
/// would send it.
fn prepare(
    engine: &mut Engine,
    root: &Path,
    origin_directly: bool,
) -> io::Result<report::Prepared> {
    let cli = NodeCli::find()?;
    let config = cache_root().join("config");
    let prepared: Value = engine.request(&json!({
        "kind": "commandOutboundPrepare",
        "root": root,
        "home": workspace_command::home(),
        "globalRemotesFile": config.join("global-remotes.json"),
        "globalConfigDir": config,
        "nodeExecutable": cli.node,
        "bitDir": cli.bit_dir,
        "bitVersion": cli.version,
        "bitmapHistoryFileId": workspace_command::file_id(),
        "clientId": client_id()?,
        "exportDate": now_ms().to_string(),
        "operation": "export",
        "ids": [],
        "options": { "originDirectly": origin_directly },
    }))?;
    report::prepared(&prepared)
}

/// `the engine declined commandOutboundApply: outbound persist failed:
/// <scope>: <message>`: the failed scope's index and the `PersistFailed`
/// message with the export's scopes (`addScopesInvolvedToError`).
fn persist_failure(error: &str, scopes: &[String]) -> Option<(usize, String)> {
    let (_, rest) = error.split_once("outbound persist failed: ")?;
    let (scope, message) = rest.split_once(": ")?;
    let index = scopes
        .iter()
        .position(|known| known == scope)?;
    Some((
        index,
        format!(
            "failed persisting to the following scopes: {scope}\nerrors:\n{scope} - {message}\n\nthe remote bit.dev will try to re-persist the data for the failed scopes.\n   \nthe following scopes were used for this export: {}",
            scopes.join(", "),
        ),
    ))
}

/// `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`.
fn client_id() -> io::Result<String> {
    let mut bytes = [0_u8; 8];
    getrandom::fill(&mut bytes).map_err(|error| io::Error::other(error.to_string()))?;
    let mut id = format!("{}-", now_ms());
    for byte in bytes {
        let _ = write!(id, "{byte:02x}");
    }
    Ok(id)
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis())
}

#[cfg(test)]
mod export_tests;
