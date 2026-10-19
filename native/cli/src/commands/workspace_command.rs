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
pub(in crate::commands) mod switch;
pub mod versions;

pub(in crate::commands) use execution::loader_output;
pub use execution::{
    execute_failure_scope, execute_json, execute_then, execute_with, execute_with_scope,
    execute_without_loader,
};
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

impl Planned {
    /// Reuse the retained command's pool for fresh post-write tooling reads.
    pub(in crate::commands) fn engine_mut(&mut self) -> &mut Engine {
        &mut self.engine
    }

    /// `MergingMain` clears the cached current and incoming versions after writing.
    pub(in crate::commands) fn merge_cache_ids(&self) -> io::Result<Vec<String>> {
        let rows = array(self.plan["result"].get("components"), "merged components")?;
        let targets = self.context["lane"]["targets"].as_array();
        let mut ids = Vec::new();
        for row in rows {
            let current = text(row.get("id"))?;
            ids.push(current.to_owned());
            let identity = current.rsplit_once('@').map_or(current, |(identity, _)| identity);
            let incoming = targets
                .into_iter()
                .flatten()
                .find(|target| target["identity"] == identity)
                .and_then(|target| target["head"].as_str());
            if let Some(head) = incoming {
                let incoming = format!("{identity}@{head}");
                if incoming != current {
                    ids.push(incoming);
                }
            }
        }
        Ok(ids)
    }
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

/// Preserve the native lane-history owner and the already initialized provider session.
pub(in crate::commands) fn plan_retained(
    root: &Path,
    request: &Request<'_>,
    startup: &mut super::status::autosync::Startup,
    environment: Option<super::status::environments::Environments>,
    engine: Engine,
) -> io::Result<Planned> {
    let mut prepared =
        preparation::capture_retained(root, request, Some(&mut *startup), environment, engine)?;
    let plan = preparation::owned_result(
        plan_captured(&mut prepared, request, false, Some(&mut *startup)),
        &mut prepared.docs,
        Some(&mut *startup),
    )?;
    stage_captured(root, request, false, false, prepared, plan, Some(&mut *startup))
}

impl Planned {
    /// Return the session containing the retained history selection after a checkout phase.
    pub(in crate::commands) fn into_engine(self) -> Engine {
        self.engine
    }
}

/// Preserve one initialized provider session through switch and installation.
pub(in crate::commands) fn plan_with_environment(
    root: &Path,
    request: &Request<'_>,
    startup: &mut super::status::autosync::Startup,
    environment: super::status::environments::Environments,
) -> io::Result<Planned> {
    let environment =
        checkout_lifecycle::bootstrap_inherited(root, request, startup, environment, false)?;
    plan_with(root, request, false, false, Some(startup), false, Some(environment))
}

/// Merge keeps its provider session across planning, install and a possible resolution snap.
pub(in crate::commands) fn plan_merge_with_environment(
    root: &Path,
    request: &Request<'_>,
    startup: &mut super::status::autosync::Startup,
    environment: super::status::environments::Environments,
) -> io::Result<Planned> {
    let preview = request.options["noSnap"] != true;
    let environment =
        checkout_lifecycle::bootstrap_inherited(root, request, startup, environment, preview)?;
    plan_with(root, request, preview, true, Some(startup), true, Some(environment))
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
    mut startup: Option<&mut super::status::autosync::Startup>,
    defer_snapshot: bool,
    inherited: Option<super::status::environments::Environments>,
) -> io::Result<Planned> {
    let mut prepared =
        preparation::capture(root, request, preview_snapshot, startup.as_deref_mut(), inherited)?;
    let plan = preparation::owned_result(
        plan_captured(&mut prepared, request, internal_materialization, startup.as_deref_mut()),
        &mut prepared.docs,
        startup.as_deref_mut(),
    )?;
    stage_captured(root, request, preview_snapshot, defer_snapshot, prepared, plan, startup)
}

fn stage_captured(
    root: &Path,
    request: &Request<'_>,
    preview_snapshot: bool,
    defer_snapshot: bool,
    mut prepared: preparation::Prepared,
    mut plan: Value,
    mut startup: Option<&mut super::status::autosync::Startup>,
) -> io::Result<Planned> {
    let mut steps = Steps {
        engine: &mut prepared.engine,
        root,
        home: &prepared.home,
        token: &prepared.token,
        context: &prepared.context,
    };
    let capture = preparation::owned_result(
        steps.stages(&mut plan, prepared.capture, request, preview_snapshot, defer_snapshot),
        &mut prepared.docs,
        startup.as_deref_mut(),
    )?;
    if defer_snapshot {
        defer_merge_snapshot(&mut prepared.engine, &prepared.token, &mut plan)?;
    }
    preparation::publish_docs(prepared.docs.take(), startup)?;
    Ok(Planned {
        engine: prepared.engine,
        token: prepared.token,
        context: prepared.context,
        capture,
        plan,
        apply: "commandApply",
    })
}

fn plan_captured(
    prepared: &mut preparation::Prepared,
    request: &Request<'_>,
    internal_materialization: bool,
    startup: Option<&mut super::status::autosync::Startup>,
) -> io::Result<Value> {
    let semver =
        grammar::snapshot(semver_values(request.to, &prepared.context)?.iter().map(String::as_str))
            .ok_or_else(|| decline("semver grammar limits"))?;
    let mut plan_request = json!({
        "kind": "commandPlan",
        "token": prepared.token,
        "current": prepared.capture.captured,
        "dependencyReadSet": prepared.capture.dependency_read_set(),
        "semver": semver,
    });
    lane::validate(&request.options, &prepared.context, internal_materialization)?;
    if let Some(ids) = lane::pattern_ids(&request.options, &prepared.context)? {
        plan_request["lanePatternIds"] = json!(ids);
    }
    let mut plan: Value = prepared.engine
        .request(&plan_request)
        .inspect_err(|error| {
            if let Some(progress) = super::engine::canonical_progress(error)
                && let Some(startup) = startup
            {
                startup.build_progress = Some(progress.clone());
            }
        })?;
    if !prepared.selector_loads.is_empty() {
        plan["progress"]["loads"] = json!(prepared.selector_loads);
    }
    if plan.get("token").and_then(Value::as_str) != Some(prepared.token.as_str()) {
        return Err(decline("command plan token"));
    }
    Ok(plan)
}

fn defer_merge_snapshot(engine: &mut Engine, token: &str, plan: &mut Value) -> io::Result<()> {
    let deferred: Value =
        engine.request(&json!({"kind":"commandMergeDeferSnapshot","token":token}))?;
    plan["mergeSnapshotSeeds"] = deferred["identities"].clone();
    plan.as_object_mut()
        .unwrap()
        .remove("needsSnap");
    Ok(())
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
    commit_receipt(planned, root).map(|_| ())
}

/// Preserve native publication receipts for operations with post-write continuations.
fn commit_receipt(planned: &mut Planned, root: &Path) -> io::Result<Value> {
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
    Ok(applied)
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
