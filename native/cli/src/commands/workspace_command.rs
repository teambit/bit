//! The workspace commands the Node.js glue ran through
//! `readRustWorkspaceCommand` (`rust-workspace-command.ts`): the engine
//! prepares and plans, the status capture supplies the current components,
//! and the report is formatted before anything is written.
//!
//! Until the commit starts, every failure leaves the command to the Node.js
//! CLI. After it starts, failures are the command's own, reported as the
//! Node.js CLI reports them.

pub mod format;
pub mod progress;
pub mod resolve;
pub mod results;

mod defaults;
mod policy;
mod snapshot;

use super::{
    color::Chalk,
    engine::Engine,
    status::{
        cache,
        capture::{self, Capture},
        fresh::dependency_grammar,
        grammar,
        js::{array, decline, object, text, truthy},
    },
};
use crate::{history::History, native::Outcome};
use bit_install::output::Output;
use results::Report;
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, IsTerminal, Write},
    path::{Path, PathBuf},
    process::ExitCode,
    sync::Arc,
};

/// Everything decided before the first write.
pub struct Planned {
    engine: Engine,
    token: String,
    context: Value,
    capture: capture::Capture,
    /// The engine's plan: `result` and `progress` for the report.
    pub plan: Value,
    /// The request that applies the plan: `commandApply`, or the resolve
    /// commands' own.
    apply: &'static str,
}

/// What one workspace command asks the engine for.
pub struct Request<'r> {
    /// `checkout` or `merge`.
    pub operation: &'static str,
    /// The command's `options`, without `operation`.
    pub options: Value,
    /// The target version, for the semver grammar.
    pub to: Option<&'r str>,
    /// Merge re-detects cached dependencies before planning.
    pub verify_fresh: bool,
}

/// `commandPrepare`, the capture and `commandPlan`.
pub fn plan(root: &Path, request: &Request<'_>) -> io::Result<Planned> {
    if cache::no_fs_cache(root) {
        return Err(decline("no-fs-cache may be enabled"));
    }
    let home = home();
    let mut engine = Engine::new()?;
    let (token, context, targets) = prepare(&mut engine, root, &home, request)?;
    let verified = capture::CaptureOptions { verify: request.verify_fresh, ..Default::default() };
    let capture = capture::capture_with(&mut engine, root, &home, &context, &targets, verified)?;
    let semver = grammar::snapshot(semver_values(request.to, &context)?.iter().map(String::as_str))
        .ok_or_else(|| decline("semver grammar limits"))?;
    let mut plan: Value = engine.request(&json!({
        "kind": "commandPlan",
        "token": token,
        "current": capture.captured,
        "dependencyReadSet": capture.dependency_read_set(),
        "semver": semver,
    }))?;
    if plan.get("token").and_then(Value::as_str) != Some(token.as_str()) {
        return Err(decline("command plan token"));
    }
    let mut steps =
        Steps { engine: &mut engine, root, home: &home, token: &token, context: &context };
    let capture = steps.stages(&mut plan, capture, request)?;
    Ok(Planned { engine, token, context, capture, plan, apply: "commandApply" })
}

/// What the steps after `commandPlan` share.
struct Steps<'s> {
    engine: &'s mut Engine,
    root: &'s Path,
    home: &'s Path,
    token: &'s str,
    context: &'s Value,
}

impl Steps<'_> {
    /// The policy and snapshot steps the plan asks for; a lane step declines.
    fn stages(
        &mut self,
        plan: &mut Value,
        capture: Capture,
        request: &Request<'_>,
    ) -> io::Result<Capture> {
        let mut caches = Vec::new();
        if plan.get("policyPreparation").is_some() {
            if request.operation != "merge" {
                return Err(decline("the plan needs the policyPreparation step"));
            }
            let prepared = self.prepare_policy(plan.take(), &capture)?;
            *plan = prepared.plan;
            caches = prepared.caches;
        }
        let snap_failed = plan.get("snapFailed") == Some(&Value::Bool(true));
        let mut capture = if plan.get("needsSnap").is_some() || snap_failed {
            self.prepare_snapshot(plan, &caches, request)?
        } else {
            capture
        };
        if plan.get("lanePreparation").is_some() {
            return Err(decline("the plan needs the lanePreparation step"));
        }
        capture.cache.replacements = caches;
        capture.cache.replacements_only = snap_failed;
        Ok(capture)
    }
}

/// The user's home directory, as Node's `os.homedir()` reads it.
fn home() -> PathBuf {
    PathBuf::from(
        env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default(),
    )
}

/// `commandPrepare`: the token, the context and the selected targets.
fn prepare(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    request: &Request<'_>,
) -> io::Result<(String, Value, Vec<Value>)> {
    let prepared: Value = engine.request(&json!({
        "kind": "commandPrepare",
        "root": root,
        "home": home,
        "operation": request.operation,
        "dependencyGrammar": dependency_grammar()?,
        "options": request.options,
        "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
    }))?;
    let token = text(prepared.get("token"))?.to_string();
    let context = prepared
        .get("context")
        .filter(|context| truthy(Some(context)))
        .cloned();
    let context = context.ok_or_else(|| decline("command context"))?;
    let targets = array(prepared.get("targets"), "command targets")?.to_vec();
    Ok((token, context, targets))
}

/// The arguments as UTF-8, or `None`.
pub fn utf8_args(args: &[OsString]) -> Option<Vec<&str>> {
    args.iter()
        .map(|arg| arg.to_str())
        .collect()
}

/// Run the planned command: the loader lines, the commit, then the report.
/// From here on failures are the command's own.
pub fn execute(
    root: &Path,
    args: &[OsString],
    command: &str,
    mut planned: Planned,
    report: &Report,
    progress: impl FnOnce(&Output),
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let history = History::start(root, args);
    let output = loader_output(chalk);
    output.status(&format!(r#"running command "{command}"..."#));
    progress(&output);
    if let Err(error) = commit(&mut planned, root) {
        output.stop();
        history.end(false);
        eprintln!("{}", chalk.red(&error.to_string()));
        return Ok(Outcome::Exit(ExitCode::FAILURE));
    }
    output.stop();
    print(report, command)?;
    history.end(report.code == 0);
    Ok(Outcome::Exit(ExitCode::from(u8::try_from(report.code).unwrap_or(1))))
}

/// `[options.to ?? '', ...model versions, ...orphaned versions]`.
fn semver_values(to: Option<&str>, context: &Value) -> io::Result<Vec<String>> {
    let mut values = vec![to.unwrap_or_default().to_string()];
    for model in array(context.get("models"), "models")? {
        for field in ["versions", "orphanedVersions"] {
            if let Some(versions) = model
                .get(field)
                .filter(|versions| !versions.is_null())
            {
                values.extend(object(versions)?.keys().cloned());
            }
        }
    }
    Ok(values)
}

/// `capture.commit()`, then `commandApply`.
fn commit(planned: &mut Planned, root: &Path) -> io::Result<()> {
    capture::commit(&mut planned.engine, root, &planned.context, &planned.capture)?;
    let applied: Value = planned.engine.request(&json!({
        "kind": planned.apply,
        "token": planned.token,
        "dependencyReadSet": planned.capture.dependency_read_set(),
        "fileId": file_id(),
    }))?;
    if applied.get("applied") != Some(&Value::Bool(true)) {
        return Err(io::Error::other("native command apply receipt"));
    }
    Ok(())
}

/// `currentDateAndTimeToFileName()`: local time, unpadded.
fn file_id() -> String {
    use chrono::{Datelike, Timelike};
    let now = chrono::Local::now();
    format!(
        "{}-{}-{}-{}-{}-{}",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
    )
}

/// Bit's loader on stdout: ora draws a spinner on an interactive terminal
/// and prints plain lines elsewhere; `BIT_DISABLE_SPINNER` turns it off.
fn loader_output(chalk: Chalk) -> Output {
    let interactive = io::stdout().is_terminal()
        && env::var("TERM").map_or(true, |term| term != "dumb")
        && env::var_os("CI").is_none();
    let disabled = env::var("BIT_DISABLE_SPINNER")
        .is_ok_and(|value| {
            matches!(
                value
                    .trim()
                    .to_ascii_lowercase()
                    .as_str(),
                "true" | "1" | "yes" | "y" | "on",
            )
        });
    let sink: bit_install::output::Sink = Arc::new(|text: &str| {
        let mut stdout = io::stdout().lock();
        let _ = stdout.write_all(text.as_bytes());
        let _ = stdout.flush();
    });
    Output::new(chalk.enabled(), interactive, !disabled, sink)
}

/// `runReportHandler`: the report and a newline; details are kept for `bit details`.
fn print(report: &Report, command: &str) -> io::Result<()> {
    if let Some(details) = &report.details {
        let _ = persist_details(details, command);
    }
    let mut stdout = io::stdout().lock();
    stdout.write_all(format!("{}\n", report.data).as_bytes())?;
    stdout.flush()
}

/// `persistDetails`: `<CACHE_ROOT>/last-command-details/{content,meta.json}`.
fn persist_details(details: &str, command: &str) -> io::Result<()> {
    let dir = cache::cache_root().join("last-command-details");
    fs::create_dir_all(&dir)?;
    let meta = json!({ "command": command, "timestamp": crate::history::iso_now() });
    fs::write(dir.join("content"), details)?;
    fs::write(dir.join("meta.json"), serde_json::to_string(&meta)?)
}
