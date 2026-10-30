//! Native export retains transfer ownership through remote persistence and local callbacks.

mod cloud;
mod interrupt;
mod lifecycle;
mod options;
mod packages;
mod progress;
mod report;
mod selection;

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
    io::{self, Write as IoWrite},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub const COMMAND: Command = Command { name: "export", aliases: &["e"], run };

use lifecycle::Lifecycle;
use options::{Options, parse};

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(arguments) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("the arguments are not UTF-8".to_string()));
    };
    let Some(options) = parse(&arguments[1..]) else {
        return Ok(Outcome::Declined("ids or flags outside the native export".to_string()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("not inside a workspace".to_string()));
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "export",
            options.json,
            "",
            io::Error::other(super::log::OUTSIDE_WORKSPACE_ERR),
        );
    };
    match bootstrap(&root, &options) {
        Ok((engine, lifecycle)) => run_started(&root, args, &options, engine, &lifecycle),
        Err(error) => startup_failure(&root, args, error),
    }
}

fn startup_failure(root: &Path, args: &[OsString], error: io::Error) -> io::Result<Outcome> {
    if crate::commands::engine::is_canonical(&error)
        || error
            .get_ref()
            .is_some_and(
                <dyn std::error::Error + Send + Sync>::is::<
                    crate::host::callback_error::CallbackError,
                >,
            )
    {
        workspace_command::checkout_lifecycle::failure(
            root,
            args,
            "export",
            &crate::commands::status::autosync::Startup::default(),
            error,
        )
    } else {
        Ok(Outcome::Declined(format!("export: {error}")))
    }
}

fn run_started(
    root: &Path,
    args: &[OsString],
    options: &Options,
    mut engine: Engine,
    lifecycle: &Lifecycle,
) -> io::Result<Outcome> {
    io::stdout().write_all(lifecycle.take_stdout().as_bytes())?;
    let work = |output: &Output| {
        let receipt = export(root, options, &mut engine, lifecycle, output)?;
        let data = if options.json {
            serde_json::to_string_pretty(
                receipt
                    .get("jsonResult")
                    .ok_or_else(|| io::Error::other("native export JSON metadata receipt"))?,
            )?
        } else {
            report::format_with(&receipt, Chalk::detect(args), options.verbose)
        };
        Ok(Report { data, code: 0, details: None })
    };
    if options.json {
        workspace_command::execute_json(root, args, "export", work)
    } else {
        workspace_command::execute_then(root, args, "export", work)
    }
}

/// What the export did: the loader's lines and the receipt, or the error of
/// a remote that failed to persist.
struct Exported {
    count: usize,
    selected_ids: bool,
    pending: bool,
    /// Each scope and the number of objects pushed to it.
    transfers: Vec<(String, usize)>,
    /// The scopes persisted, the last one the failed one on failure.
    persisted: Vec<String>,
    fork_history: Option<report::ForkHistory>,
    result: Result<Value, String>,
    output: CallbackOutput,
}

struct CallbackOutput {
    central_hub: bool,
    messages: Vec<String>,
    observed: bool,
    last_hub_message: Option<String>,
    failure_phase: Option<String>,
    attempted_scopes: Vec<String>,
}

/// Prepare before providers, then retain ownership through transfer and publication.
fn bootstrap(root: &Path, options: &Options) -> io::Result<(Engine, Lifecycle)> {
    let mut engine = Engine::new()?;
    prepare(&mut engine, root, options, true, false)?;
    let lifecycle = Lifecycle::bootstrap(
        root,
        &mut engine,
        options.lifecycle.eject || options.lifecycle.open_browser || options.json,
    )?;
    Ok((engine, lifecycle))
}

fn export(
    root: &Path,
    options: &Options,
    engine: &mut Engine,
    lifecycle: &Lifecycle,
    output: &Output,
) -> io::Result<Value> {
    let prepared = prepare(engine, root, options, false, lifecycle.native_packages())?;
    let token = prepared.token.clone();
    let mut exported = Exported {
        count: prepared.count,
        selected_ids: !options.ids.is_empty()
            && !options.ids.iter().any(|id| options::is_pattern(id)),
        pending: !prepared.nothing_to_export,
        transfers: if options.resume.is_some() { Vec::new() } else { prepared.transfers },
        persisted: prepared.scopes.clone(),
        fork_history: prepared.fork_history,
        result: Err(String::new()),
        output: CallbackOutput {
            central_hub: prepared.central_hub,
            messages: Vec::new(),
            observed: false,
            last_hub_message: None,
            failure_phase: None,
            attempted_scopes: Vec::new(),
        },
    };
    exported.progress_before(output);
    let result = complete_export(
        engine,
        &token,
        &prepared.scopes,
        options,
        lifecycle,
        &mut exported,
        output,
    );
    io::stdout().write_all(lifecycle.take_stdout().as_bytes())?;
    result.map_err(io::Error::other)
}

fn complete_export(
    engine: &mut Engine,
    token: &str,
    scopes: &[String],
    options: &Options,
    lifecycle: &Lifecycle,
    exported: &mut Exported,
    progress: &Output,
) -> Result<Value, String> {
    let protection = lifecycle.protect(options.json).map_err(|error| error.to_string())?;
    bit_object_import::export_actions::scope(lifecycle.file_actions(), || {
        transfer(engine, token, scopes, exported, progress)
    })?;
    let stage: Value = engine
        .request(&json!({"kind":"commandOutboundStage","token":token}))
        .map_err(|error| error.to_string())?;
    protection.finish().map_err(|error| error.to_string())?;
    lifecycle.packages(&stage).map_err(|error| error.to_string())?;
    io::stdout()
        .write_all(lifecycle.take_stdout().as_bytes())
        .map_err(|error| error.to_string())?;
    let finalized: Value = engine
        .request(&json!({"kind":"commandOutboundFinalize","token":token}))
        .map_err(|error| error.to_string())?;
    let mut receipt = report::published(&finalized, token).map_err(|error| error.to_string())?;
    let finished = lifecycle
        .finish(&receipt, options.lifecycle.eject, options.lifecycle.open_browser && !options.json)
        .map_err(|error| error.to_string())?;
    if let Some(metadata) = finished.as_object() {
        for (key, value) in metadata {
            receipt[key] = value.clone();
        }
    }
    Ok(receipt)
}

fn transfer(
    engine: &mut Engine,
    token: &str,
    scopes: &[String],
    exported: &mut Exported,
    progress: &Output,
) -> Result<(), String> {
    let applied: Value = engine
        .request_with_progress(&json!({"kind":"commandOutboundApply","token":token}), |event| {
            exported.observe(event, progress);
        })
        .map_err(|error| error.to_string())?;
    if applied["token"] != token || applied["effectsOwned"] != true {
        return Err("native outbound ownership receipt".into());
    }
    exported.output.central_hub = applied["centralHub"] == true;
    exported.output.failure_phase = applied["failurePhase"].as_str().map(str::to_owned);
    exported.output.attempted_scopes = applied["attemptedScopes"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    exported.output.messages = applied["hubMessages"]
        .as_array()
        .map_or_else(Vec::new, |messages| {
            messages
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        });
    if let Some(error) = applied["failure"].as_str() {
        let error = owned_failure(error, scopes, &mut exported.persisted);
        exported.result = Err(error.clone());
        exported.progress(progress);
        return Err(error);
    }
    exported.result = Ok(Value::Null);
    exported.progress(progress);
    Ok(())
}

fn owned_failure(error: &str, scopes: &[String], persisted: &mut Vec<String>) -> String {
    if let Some((index, message)) = persist_failure(error, scopes) {
        persisted.truncate(index + 1);
        message
    } else if let Some(message) = validation_failure(error, scopes) {
        persisted.clear();
        message
    } else {
        persisted.clear();
        let involved =
            format!("the following scopes were used for this export: {}", scopes.join(", "));
        if error.ends_with(&involved) { error.to_owned() } else { format!("{error}\n{involved}") }
    }
}

/// `commandOutboundPrepare` of the staged components, as the Node.js CLI
/// would send it.
fn prepare(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    preflight: bool,
    native_packages: bool,
) -> io::Result<report::Prepared> {
    let cli = NodeCli::find()?;
    let ids = selection::ids(engine, root, options)?;
    let config = cache_root().join("config");
    let prepared: Value = engine
        .request(&json!({
            "kind": "commandOutboundPrepare",
            "skipRemoteResolution": preflight,
            "nativePackages": native_packages,
            "root": root,
            "home": workspace_command::home(),
            "globalRemotesFile": config.join("global-remotes.json"),
            "globalConfigDir": config,
            "nodeExecutable": cli.node,
            "bitDir": cli.bit_dir,
            "bitVersion": cli.version,
            "bitmapHistoryFileId": workspace_command::file_id(),
            "clientId": options.resume.clone().map_or_else(client_id, Ok)?,
            "exportDate": now_ms().to_string(),
            "operation": "export",
            "ids": ids,
            "options": {
                "originDirectly": options.origin_directly,
                "all": options.all,
                "allVersions": options.all_versions,
                "headOnly": options.head_only && !options.json,
                "forkLaneNewScope": options.fork_lane_new_scope && !options.json,
                "ignoreMissingArtifacts": options.ignore_missing_artifacts,
                "resume": options.resume,
                "patternSelection": options.ids.iter().any(|id| options::is_pattern(id)),
            },
        }))
        .map_err(canonical_prepare_error)?;
    if native_packages {
        packages::validate(&prepared)?;
    }
    report::prepared(&prepared)
}

fn canonical_prepare_error(error: io::Error) -> io::Error {
    if let Some(message) =
        error.to_string().strip_prefix("the engine declined commandOutboundPrepare: ")
        && message.starts_with("unable to resolve group id of ")
    {
        return super::engine::canonical_error(message.to_owned());
    }
    error
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

fn validation_failure(error: &str, scopes: &[String]) -> Option<String> {
    let (_, message) = error.split_once("outbound validate failed: ")?;
    Some(format!(
        "{message}\nthe following scopes were used for this export: {}",
        scopes.join(", "),
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
