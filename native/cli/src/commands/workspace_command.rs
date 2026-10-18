//! The workspace commands (checkout, merge, lane merge): the engine prepares
//! and plans, the status capture supplies the current components,
//! and the report is formatted before anything is written.
//!
//! Until the commit starts, every failure leaves the command to the Node.js
//! CLI. After it starts, failures are the command's own, reported as the
//! Node.js CLI reports them.

pub(super) mod checkout_lifecycle;
pub(crate) mod checkout_policy;
pub mod format;
pub mod progress;
pub mod resolve;
pub mod results;
pub(in crate::commands) mod stash;
pub mod versions;

pub(in crate::commands) use execution::loader_output;
pub use execution::{execute_json, execute_then, execute_with, execute_without_loader};
pub use snapshot::receipt::NodeCli;
pub(crate) use snapshot::receipt::{User, uuid_v4};

mod checkout_scope;
mod checkout_selection;
mod defaults;
mod execution;
mod lane;
mod policy;
mod preparation;
mod snapshot;

use super::{
    engine::Engine,
    status::{
        cache,
        capture::{self, Capture},
        fresh::dependency_grammar,
        grammar,
        js::{array, decline, object, text, truthy},
    },
};
use crate::native::Outcome;
use bit_install::output::Output;
use results::Report;
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io,
    path::{Path, PathBuf},
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

/// Provider startup and component callbacks precede checkout's authoritative read set.
pub fn plan_with_startup(
    root: &Path,
    request: &Request<'_>,
    startup: &mut super::status::autosync::Startup,
) -> io::Result<Planned> {
    plan_with(root, request, false, false, Some(startup), false, None)
}

/// Capture providers once, materialize the merge, then snap its retained pending identities.
pub fn plan_merge(
    root: &Path,
    request: &Request<'_>,
    startup: &mut super::status::autosync::Startup,
) -> io::Result<Planned> {
    plan_with(root, request, request.options["noSnap"] != true, true, Some(startup), true, None)
}

pub(super) fn plan_with(
    root: &Path,
    request: &Request<'_>,
    preview_snapshot: bool,
    internal_materialization: bool,
    startup: Option<&mut super::status::autosync::Startup>,
    defer_snapshot: bool,
    inherited: Option<super::status::environments::Environments>,
) -> io::Result<Planned> {
    let preparation::Prepared {
        mut engine,
        home,
        token,
        context,
        capture,
        selector_loads,
    } = preparation::capture(root, request, preview_snapshot, startup, inherited)?;
    let semver = grammar::snapshot(semver_values(request.to, &context)?.iter().map(String::as_str))
        .ok_or_else(|| decline("semver grammar limits"))?;
    let mut plan_request = json!({
        "kind": "commandPlan",
        "token": token,
        "current": capture.captured,
        "dependencyReadSet": capture.dependency_read_set(),
        "semver": semver,
    });
    lane::validate(&request.options, &context, internal_materialization)?;
    if let Some(ids) = lane::pattern_ids(&request.options, &context)? {
        plan_request["lanePatternIds"] = json!(ids);
    }
    let mut plan: Value = engine.request(&plan_request)?;
    if !selector_loads.is_empty() {
        plan["progress"]["loads"] = json!(selector_loads);
    }
    if plan.get("token").and_then(Value::as_str) != Some(token.as_str()) {
        return Err(decline("command plan token"));
    }
    let mut steps =
        Steps { engine: &mut engine, root, home: &home, token: &token, context: &context };
    let capture = steps.stages(&mut plan, capture, request, preview_snapshot, defer_snapshot)?;
    if defer_snapshot {
        let deferred: Value =
            engine.request(&json!({"kind":"commandMergeDeferSnapshot","token":token}))?;
        plan["mergeSnapshotSeeds"] = deferred["identities"].clone();
        plan.as_object_mut()
            .unwrap()
            .remove("needsSnap");
    }
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
        preview_snapshot: bool,
        defer_snapshot: bool,
    ) -> io::Result<Capture> {
        self.checkout_policy(plan)?;
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
        let mut capture = if !defer_snapshot && (plan.get("needsSnap").is_some() || snap_failed) {
            self.prepare_snapshot(plan, &caches, request, preview_snapshot)?
        } else {
            capture
        };
        if let Some(preparation) = plan.get("lanePreparation").cloned() {
            self.finalize_lane(plan, &preparation)?;
        }
        capture.cache.replacements = caches;
        capture.cache.replacements_only = snap_failed;
        Ok(capture)
    }
}

/// The user's home directory, as Node's `os.homedir()` reads it.
pub fn home() -> PathBuf {
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
    preview_snapshot: bool,
) -> io::Result<(String, Value, Vec<Value>)> {
    let mut options = request.options.clone();
    if options["includeNewFromScope"] == true {
        options["scopeCandidates"] =
            json!(checkout_scope::candidates(engine, root, home, request)?);
    }
    let prepared: Value = engine.request(&json!({
        "kind": "commandPrepare",
        "root": root,
        "home": home,
        "operation": request.operation,
        "internalSnapshotPreview": preview_snapshot,
        "deferCheckoutPattern": checkout_selection::deferred(request),
        "dependencyGrammar": dependency_grammar()?,
        "options": options,
        "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
    }))?;
    let token = text(prepared.get("token"))?.to_string();
    let context = prepared
        .get("context")
        .filter(|context| truthy(Some(context)))
        .cloned();
    let mut context = context.ok_or_else(|| decline("command context"))?;
    context["commandProgress"] = prepared["progress"].clone();
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
    execute_with(root, args, command, report, |output| {
        progress(output);
        commit(&mut planned, root)
    })
}

/// `[options.to ?? '', ...model versions, ...orphaned versions]`.
pub(super) fn semver_values(to: Option<&str>, context: &Value) -> io::Result<Vec<String>> {
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
pub(super) fn commit(planned: &mut Planned, root: &Path) -> io::Result<()> {
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
pub fn file_id() -> String {
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
