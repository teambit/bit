//! The resolve commands, `bit snap`, `bit tag` and `bit merge --resolve`,
//! planned by the engine's `command{Snap,Tag,Resolve}*` requests on top of
//! the status capture and the snapshot receipt merges use.

pub(in crate::commands) mod policy;
pub(in crate::commands) mod workflow;

pub(in crate::commands) use lifecycle::{render_build_output, render_events};
pub(super) use receipts::component_receipts;

mod blockers;
mod lifecycle;
mod parameters;
mod published;
mod receipts;
#[cfg(test)]
mod resolve_tests;
mod tag;

use super::{Planned, defaults, home, snapshot};
use crate::commands::{
    engine::Engine,
    status::{
        autosync::Startup,
        capture::{self, Capture, CaptureOptions},
        environments, grammar, issues,
        js::{array, decline, text},
    },
};
use parameters::{preparation, session_environment, stage_soft_history};
use receipts::{Resolved, auto_snap_report, check_token, identities, pattern_ids, semver_values};
use serde_json::{Value, json};
use std::{io, path::Path};

/// `bit snap`, `bit tag` or `bit merge --resolve`: the engine's
/// `commandSnap*`, `commandTag*` or `commandResolve*`.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Snap,
    Tag,
    /// `bit merge --resolve`: snaps the components in merge state.
    Resolve,
}

impl Kind {
    fn request(self, step: &str) -> String {
        match self {
            Self::Snap => format!("commandSnap{step}"),
            Self::Tag => format!("commandTag{step}"),
            Self::Resolve => format!("commandResolve{step}"),
        }
    }
}

/// Which components the command selects.
pub enum Selection<'r> {
    /// `bit snap [component-id]`, or the components during a merge.
    Snap { pattern: Option<&'r str>, unmerged: bool },
    /// `bit tag [patterns...]`: the tag options, the patterns and `--ver`.
    Tag { tag_options: Value, patterns: &'r [String], exact_version: Option<&'r str> },
    /// `bit merge [component-pattern] --resolve`.
    Resolve { pattern: Option<&'r str> },
}

/// What a resolve command asks for.
pub struct ResolveRequest<'r> {
    pub kind: Kind,
    /// The command's `options`, as the engine reads them.
    pub options: Value,
    pub selection: Selection<'r>,
}

/// Plan snapshot tooling around the native transaction and retain all publication state.
pub fn plan_snapshot(
    root: &Path,
    request: &ResolveRequest<'_>,
    startup: &mut Startup,
    workflow: &workflow::Workflow,
) -> io::Result<Planned> {
    if let Some(ignored) = request.options["policy"]["ignoreIssues"]
        .as_str()
        .filter(|ignored| *ignored != "*")
    {
        for name in ignored.split(',').map(str::trim) {
            issues::validate_name(name)?;
        }
    }
    let soft = matches!(&request.selection, Selection::Tag {tag_options,..} if tag_options["soft"] == true);
    if let Selection::Tag { tag_options, .. } = &request.selection
        && workflow.editor
            .as_deref()
            .is_some_and(|editor| !editor.is_empty())
        && (tag_options["persist"] == true
            || request.options["message"]
                .as_str()
                .is_some_and(|message| !message.is_empty()))
    {
        return Err(decline("tag editor options require canonical validation"));
    }
    let session = Session::prepare(root, request, Some(startup), workflow.build && !soft, None)?;
    startup.stdout.push_str(&capture::callback_startup_stdout(&session.capture));
    complete(session, request, Some((workflow, startup)))
}

/// Continue a materialized merge using its existing provider session.
pub(in crate::commands) fn plan_continuation(
    root: &Path,
    request: &ResolveRequest<'_>,
    startup: &mut Startup,
    workflow: &workflow::Workflow,
    environment: Option<environments::Environments>,
) -> io::Result<Planned> {
    let session = Session::prepare(root, request, Some(startup), workflow.build, environment)?;
    startup.stdout.push_str(&capture::callback_startup_stdout(&session.capture));
    complete(session, request, Some((workflow, startup)))
}

fn complete(
    mut session: Session<'_>,
    request: &ResolveRequest<'_>,
    mut lifecycle: Option<(&workflow::Workflow, &mut Startup)>,
) -> io::Result<Planned> {
    let mut plan = session.plan(request)?;
    let needs_snap = array(plan.get("needsSnap"), "needs snap")?;
    if plan.get("noop") == Some(&Value::Bool(true)) && request.kind != Kind::Resolve {
        if !plan["result"].is_null() || !needs_snap.is_empty() {
            return Err(decline("native snap noop receipt"));
        }
        return Ok(session.planned(plan));
    }
    let needs_snap = identities(needs_snap)?;
    let soft = matches!(&request.selection, Selection::Tag { tag_options, .. } if tag_options["soft"] == true);
    let messages =
        lifecycle::before_snapshot(&mut session, &plan, request, &needs_snap, &mut lifecycle)?;
    published::resolve(
        &mut session,
        request,
        &mut plan,
        lifecycle.as_mut().map(|(_, startup)| &mut **startup),
    )?;
    let mut plan = session.finalize(&plan, &needs_snap, soft, &request.options, &messages)?;
    if !soft {
        lifecycle::finish(&mut session, &mut plan, request, lifecycle)?;
    }
    // Resolve captured with a reset cache already.
    session.capture.cache.force_reset();
    Ok(session.planned(plan))
}

/// One resolve command's engine session and capture.
struct Session<'r> {
    root: &'r Path,
    kind: Kind,
    engine: Engine,
    token: String,
    context: Value,
    capture: Capture,
    selector_loads: Vec<usize>,
}

impl<'r> Session<'r> {
    /// `command*Prepare` and the capture of its targets.
    fn prepare(
        root: &'r Path,
        request: &ResolveRequest<'_>,
        startup: Option<&mut Startup>,
        build: bool,
        inherited: Option<environments::Environments>,
    ) -> io::Result<Self> {
        let home = home();
        let mut engine = Engine::new()?;
        let environments =
            session_environment(&mut engine, root, &home, startup, build, inherited)?;
        let prepared = preparation(&mut engine, root, &home, request, environments.is_some())?;
        let mut context = prepared["context"].clone();
        if matches!(&request.selection, Selection::Tag { tag_options, .. } if tag_options["soft"] == true)
        {
            stage_soft_history(&mut engine, root, &home, &mut context)?;
        }
        let targets = array(prepared.get("targets"), "targets")?;
        let pending_tag = matches!(&request.selection, Selection::Tag { tag_options, .. } if tag_options["persist"] == true || tag_options["soft"] == true);
        let verify = CaptureOptions {
            environments,
            allow_special_states: matches!(
                &request.selection,
                Selection::Tag { .. } | Selection::Snap { .. },
            ),
            verify: true,
            reset: request.kind == Kind::Resolve,
            missing_status_invalid: pending_tag,
            ..CaptureOptions::default()
        };
        let capture = capture::capture_with(&mut engine, root, &home, &context, targets, verify)?;
        Ok(Self {
            root,
            kind: request.kind,
            engine,
            token: text(prepared.get("token"))?.to_string(),
            context,
            capture,
            selector_loads: Vec::new(),
        })
    }

    /// `command*Plan`, with the snap's selected ids or the tag's selections.
    fn plan(&mut self, request: &ResolveRequest<'_>) -> io::Result<Value> {
        let mut versions = semver_values(&self.context, &self.capture)?;
        let mut plan_request = json!({
            "kind": self.kind.request("Plan"),
            "token": self.token,
            "current": self.capture.captured,
            "dependencyReadSet": self.capture.dependency_read_set(),
            "components": component_receipts(&self.context, &self.capture)?,
        });
        match &request.selection {
            Selection::Resolve { pattern } => {
                if let Some(ids) = self.pattern_ids(*pattern)? {
                    plan_request["selectedIds"] = json!(ids);
                }
            }
            Selection::Snap { pattern, unmerged } => {
                if !unmerged && let Some(ids) = self.pattern_ids(*pattern)? {
                    plan_request["selectedIds"] = json!(ids);
                }
            }
            Selection::Tag { patterns, exact_version, .. } => {
                let selections = self.tag_selections(&plan_request, patterns)?;
                versions.extend(exact_version.iter().map(ToString::to_string));
                versions.extend(tag::entered_versions(selections.as_ref()));
                versions.extend(tag::pending_versions(&self.context));
                if let Some(selections) = selections {
                    plan_request["tagSelections"] = selections;
                }
            }
        }
        plan_request["semver"] = grammar::snapshot(versions.iter().map(String::as_str))
            .ok_or_else(|| decline("semver grammar limits"))?;
        let mut plan: Value = self.engine.request(&plan_request)?;
        self.selector_progress(&mut plan)?;
        check_token(&plan, &self.token)?;
        plan["tagPatternSelections"] = plan_request["tagSelections"].clone();
        Ok(plan)
    }

    fn selector_progress(&self, plan: &mut Value) -> io::Result<()> {
        let mut loading = self.capture.environment_facts["snapshotEnvironmentLoads"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        loading.extend(
            self.selector_loads
                .iter()
                .map(|count| json!(count)),
        );
        if !loading.is_empty() {
            let loads = plan["progress"]["loads"]
                .as_array_mut()
                .ok_or_else(|| decline("snapshot progress loads"))?;
            let index = usize::from(!loads.is_empty());
            loads.splice(index..index, loading);
        }
        Ok(())
    }

    fn tag_selections(
        &mut self,
        plan_request: &Value,
        patterns: &[String],
    ) -> io::Result<Option<Value>> {
        let mut context = self.context.clone();
        if patterns.iter().any(|pattern| crate::commands::diff::selection::stateful(pattern)) {
            let mut request = plan_request.clone();
            request["kind"] = json!("commandTagCandidates");
            request["semver"] = json!({});
            let candidates: Value = self.engine.request(&request)?;
            check_token(&candidates, &self.token)?;
            let ids = array(candidates.get("candidateIds"), "tag candidates")?;
            context["targets"]
                .as_array_mut()
                .ok_or_else(|| decline("tag targets"))?
                .retain(|target| ids.contains(&target["identity"]));
        }
        let (selected, loading) = tag::selections_with_state(
            &mut self.engine,
            self.root,
            &context,
            patterns,
            &self.capture,
        )?;
        self.selector_loads.extend(loading);
        Ok(selected)
    }

    fn pattern_ids(&mut self, pattern: Option<&str>) -> io::Result<Option<Vec<String>>> {
        let Some(pattern) =
            pattern.filter(|pattern| crate::commands::diff::selection::stateful(pattern))
        else {
            return pattern_ids(&self.context, pattern);
        };
        let targets = array(self.context.get("targets"), "snapshot selector targets")?;
        let (selected, loading) = crate::commands::diff::selection::select_capture(
            &mut self.engine,
            self.root,
            &self.context,
            targets,
            pattern,
            &self.capture,
        )?;
        self.selector_loads.extend(loading);
        selected
            .iter()
            .map(|target| text(target.get("identity")).map(str::to_owned))
            .collect::<io::Result<Vec<_>>>()
            .map(Some)
    }

    /// The issue check, the receipt and `command*Finalize`: the result and
    /// progress to report.
    fn finalize(
        &mut self,
        plan: &Value,
        needs_snap: &[String],
        soft: bool,
        options: &Value,
        messages: &Value,
    ) -> io::Result<Value> {
        let resolved = Resolved { root: self.root, context: &self.context, capture: &self.capture };
        let mut receipt = if soft {
            let mut log = snapshot::receipt::User::load(self.root)?.log();
            log["message"] = json!(options["message"].as_str().unwrap_or_default());
            json!({"log":log})
        } else {
            resolved.receipt(self.kind, needs_snap, plan, options)?
        };
        lifecycle::messages(&mut receipt, messages)?;
        lifecycle::planned_tasks(&mut receipt, &self.capture)?;
        let allocated_versions = (self.kind == Kind::Resolve).then(|| receipt["versions"].clone());
        let auto_snapped =
            if self.kind == Kind::Resolve { Some(auto_snap_report(plan, &receipt)?) } else { None };
        let finalized: Value = self.engine.request(&json!({
            "kind": self.kind.request("Finalize"),
            "token": self.token,
            "snapReceipt": receipt,
            "dependencyReadSet": self.capture.dependency_read_set(),
        }))?;
        check_token(&finalized, &self.token)?;
        let progress = finalized
            .get("progress")
            .filter(|progress| !progress.is_null());
        let progress = progress.unwrap_or_else(|| &plan["progress"]);
        let mut result = json!({ "result": finalized["result"], "progress": progress, "stagedObjects": finalized["stagedObjects"], "versions":finalized["versions"], "packageManifestPlans":finalized["packageManifestPlans"] });
        if let Some(auto_snapped) = auto_snapped {
            result["autoSnappedResults"] = json!(auto_snapped);
        }
        if let Some(allocated_versions) = allocated_versions {
            result["allocatedVersions"] = allocated_versions;
        }
        Ok(result)
    }

    fn planned(self, plan: Value) -> Planned {
        let apply = match self.kind {
            Kind::Snap => "commandSnapApply",
            Kind::Tag => "commandTagApply",
            Kind::Resolve => "commandResolveApply",
        };
        let Self { engine, token, context, capture, .. } = self;
        Planned { engine, token, context, capture, plan, apply }
    }
}
