//! Native `bit checkout <to> [component-pattern] -x`, the flow of
//! `readRustWorkspaceCommand` and `runRustWorkspaceCommand` in the Node.js
//! glue (`rust-workspace-command.ts`) for checkout: the workspace engine
//! prepares and plans, the status capture supplies the current components,
//! and the report is formatted before anything is written.
//!
//! Until the commit starts, every failure leaves the command to the Node.js
//! CLI. After it starts, failures are the command's own, reported as the
//! Node.js CLI reports them.

mod options;
mod progress;
mod report;

use super::{
    color::Chalk,
    engine::Engine,
    status::{
        cache, capture,
        fresh::dependency_grammar,
        grammar,
        js::{array, decline, object, text, truthy},
    },
};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use bit_install::output::Output;
use options::Options;
use progress::Progress;
use report::Report;
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

pub const COMMAND: Command = Command { name: "checkout", aliases: &["U"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = args
        .iter()
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()
    else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native checkout grammar".to_string()));
    };
    // Harmony imports nothing for `main` where the engine reports a version
    // import, so the progress lines would differ.
    if options.to == "main" {
        return Ok(Outcome::Declined("checkout main progress".to_string()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let home = PathBuf::from(
        env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default(),
    );
    let chalk = Chalk::detect(args);
    let mut planned = match plan(&root, &home, &options, chalk) {
        Ok(planned) => planned,
        Err(error) => return Ok(Outcome::Declined(format!("checkout: {error}"))),
    };
    let history = History::start(&root, args);
    let output = loader_output(chalk);
    output.status(r#"running command "checkout"..."#);
    if let Some(progress) = &planned.progress {
        progress.render(&output);
    }
    if let Err(error) = commit(&mut planned, &root) {
        output.stop();
        history.end(false);
        eprintln!("{}", chalk.red(&error.to_string()));
        return Ok(Outcome::Exit(ExitCode::FAILURE));
    }
    output.stop();
    print(&planned.report)?;
    history.end(planned.report.code == 0);
    Ok(Outcome::Exit(ExitCode::from(u8::try_from(planned.report.code).unwrap_or(1))))
}

/// Everything decided before the first write.
struct Planned {
    engine: Engine,
    token: String,
    context: Value,
    capture: capture::Capture,
    report: Report,
    progress: Option<Progress>,
}

/// `commandPrepare`, the capture, `commandPlan`, and the report.
fn plan(root: &Path, home: &Path, options: &Options, chalk: Chalk) -> io::Result<Planned> {
    if cache::no_fs_cache(root) {
        return Err(decline("no-fs-cache may be enabled"));
    }
    let mut engine = Engine::new()?;
    let prepared: Value = engine.request(&json!({
        "kind": "commandPrepare",
        "root": root,
        "home": home,
        "operation": "checkout",
        "dependencyGrammar": dependency_grammar()?,
        "options": options.request(),
        "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
    }))?;
    let token = text(prepared.get("token"))?.to_string();
    let context = prepared
        .get("context")
        .filter(|context| truthy(Some(context)))
        .cloned();
    let context = context.ok_or_else(|| decline("command context"))?;
    let targets = array(prepared.get("targets"), "command targets")?;
    let capture = capture::capture(&mut engine, root, home, &context, targets)?;
    let semver = grammar::snapshot(semver_values(options, &context)?.iter().map(String::as_str))
        .ok_or_else(|| decline("semver grammar limits"))?;
    let plan: Value = engine.request(&json!({
        "kind": "commandPlan",
        "token": token,
        "current": capture.captured,
        "dependencyReadSet": capture.dependency_read_set(),
        "semver": semver,
    }))?;
    accept_plan(&plan, &token)?;
    let report = report::format(&plan["result"], options, chalk)?;
    let progress = Progress::parse(plan.get("progress"))?;
    Ok(Planned { engine, token, context, capture, report, progress })
}

/// A plan checkout can apply on its own: no policy projection, snapshot or lane step.
fn accept_plan(plan: &Value, token: &str) -> io::Result<()> {
    if plan.get("token").and_then(Value::as_str) != Some(token) {
        return Err(decline("command plan token"));
    }
    let staged = ["policyPreparation", "needsSnap", "lanePreparation"];
    if staged
        .iter()
        .any(|key| plan.get(*key).is_some())
        || truthy(plan.get("snapFailed"))
    {
        return Err(decline("checkout plan needs a merge step"));
    }
    Ok(())
}

/// `[options.to ?? '', ...model versions, ...orphaned versions]`.
fn semver_values(options: &Options, context: &Value) -> io::Result<Vec<String>> {
    let mut values = vec![options.to.clone()];
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
        "kind": "commandApply",
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
fn print(report: &Report) -> io::Result<()> {
    if let Some(details) = &report.details {
        let _ = persist_details(details);
    }
    let mut stdout = io::stdout().lock();
    stdout.write_all(format!("{}\n", report.data).as_bytes())?;
    stdout.flush()
}

/// `persistDetails`: `<CACHE_ROOT>/last-command-details/{content,meta.json}`.
fn persist_details(details: &str) -> io::Result<()> {
    let dir = cache::cache_root().join("last-command-details");
    fs::create_dir_all(&dir)?;
    let meta = json!({ "command": "checkout", "timestamp": crate::history::iso_now() });
    fs::write(dir.join("content"), details)?;
    fs::write(dir.join("meta.json"), serde_json::to_string(&meta)?)
}
