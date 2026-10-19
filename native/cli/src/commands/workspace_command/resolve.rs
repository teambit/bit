#![cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::overly_long_file,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
//! The resolve commands, `bit snap`, `bit tag` and `bit merge --resolve`,
//! planned by the engine's `command{Snap,Tag,Resolve}*` requests on top of
//! the status capture and the snapshot receipt merges use.

pub(in crate::commands) mod policy;
pub(in crate::commands) mod workflow;

pub(in crate::commands) use lifecycle::{render_build_output, render_events};

mod blockers;
mod lifecycle;
mod parameters;
mod published;
mod tag;

use super::{
    Planned, defaults, home,
    snapshot::{graphs, receipt},
};
use crate::commands::{
    engine::Engine,
    patterns,
    status::{
        autosync::Startup,
        cache,
        capture::{self, Capture, CaptureOptions},
        environments,
        fresh::dependency_grammar,
        grammar, issues,
        js::{array, decline, object, text, truthy},
        policy as status_policy,
    },
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};

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

fn session_environment(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    startup: Option<&mut Startup>,
    build: bool,
    inherited: Option<environments::Environments>,
) -> io::Result<Option<environments::Environments>> {
    if let Some(environment) = inherited {
        return environment.continue_snapshot(build).map(Some);
    }
    startup
        .map(|startup| {
            environments::read_snapshot_context(engine, root, home, build, startup)
                .map(|(_, environments)| environments)
        })
        .transpose()
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
        let context = prepared["context"].clone();
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
            let mut log = receipt::User::load(self.root)?.log();
            log["message"] = json!(options["message"].as_str().unwrap_or_default());
            json!({"log":log})
        } else {
            resolved.receipt(self.kind, needs_snap, plan, options)?
        };
        lifecycle::messages(&mut receipt, messages)?;
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

fn preparation(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    request: &ResolveRequest<'_>,
    callbacks: bool,
) -> io::Result<Value> {
    let mut prepare = json!({
        "kind": request.kind.request("Prepare"),
        "root": root,
        "home": home,
        "options": request.options,
        "dependencyGrammar": dependency_grammar()?,
        "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
    });
    if callbacks && request.kind == Kind::Resolve {
        prepare["options"]["callbackLifecycle"] = json!(true);
    }
    if let Selection::Tag { tag_options, .. } = &request.selection {
        prepare["tagOptions"] = tag_options.clone();
    }
    let prepared: Value = engine.request(&prepare)?;
    validate_preparation(&prepared, request.kind)?;
    Ok(prepared)
}

fn check_token(receipt: &Value, token: &str) -> io::Result<()> {
    if receipt.get("token").and_then(Value::as_str) == Some(token) {
        Ok(())
    } else {
        Err(decline("resolve token"))
    }
}

/// The automatic dependents from the resolve plan, with hashes allocated in
/// the same receipt that the engine commits. This is for the enclosing merge
/// report; the standalone `merge --resolve` result keeps its Node shape.
fn auto_snap_report(plan: &Value, receipt: &Value) -> io::Result<Vec<Value>> {
    let versions = array(receipt.get("versions"), "resolve receipt versions")?;
    let hashes = versions
        .iter()
        .map(|version| Ok((text(version.get("identity"))?, text(version.get("hash"))?)))
        .collect::<io::Result<HashMap<_, _>>>()?;
    if hashes.len() != versions.len() {
        return Err(decline("resolve automatic snap identities"));
    }
    let selected = array(plan["result"].get("resolvedComponents"), "resolved components")?
        .iter()
        .map(|row| text(row.get("id")))
        .collect::<io::Result<HashSet<_>>>()?;
    let mut seen = HashSet::new();
    array(plan.get("autoSnapResults"), "resolve automatic snaps")?
        .iter()
        .map(|row| {
            let identity = text(row.get("id"))?;
            let hash =
                hashes.get(identity).ok_or_else(|| decline("resolve automatic snap hash"))?;
            let triggered = array(row.get("triggeredBy"), "resolve automatic triggers")?
                .iter()
                .map(|id| text(Some(id)).map(str::to_string))
                .collect::<io::Result<Vec<_>>>()?;
            if identity.is_empty()
                || selected.contains(identity)
                || !seen.insert(identity)
                || triggered.is_empty()
            {
                return Err(decline("resolve automatic snap report"));
            }
            Ok(json!({
                "component": { "id": format!("{identity}@{hash}") },
                "triggeredBy": triggered,
            }))
        })
        .collect()
}

/// `validatePreparation`: the context's targets are the targets, and the
/// selected ids are distinct targets.
fn validate_preparation(prepared: &Value, kind: Kind) -> io::Result<()> {
    let targets = prepared.get("targets").and_then(Value::as_array);
    let selected = prepared.get("selectedIds").and_then(Value::as_array);
    let (Some(targets), Some(selected)) = (targets, selected) else {
        return Err(decline("resolve preparation receipt"));
    };
    if !prepared["token"].is_string()
        || !truthy(prepared.get("context"))
        || targets.len() > 4096
        || selected.len() > 4096
        || (kind == Kind::Resolve && selected.is_empty())
    {
        return Err(decline("resolve preparation receipt"));
    }
    let same = serde_json::to_string(&prepared["context"]["targets"]).ok()
        == serde_json::to_string(&prepared["targets"]).ok();
    if !same {
        return Err(decline("resolve workspace capture receipt"));
    }
    let known: HashSet<&str> = targets
        .iter()
        .filter_map(|target| target["identity"].as_str())
        .collect();
    let chosen: HashSet<&str> = selected
        .iter()
        .filter_map(Value::as_str)
        .collect();
    if known.len() != targets.len() || chosen.len() != selected.len() || !chosen.is_subset(&known) {
        return Err(decline("resolve selection receipt"));
    }
    Ok(())
}

/// `resolveSemver`'s inputs: every version the models, the context's
/// versions, the capture and the dependency states mention.
fn semver_values(context: &Value, capture: &Capture) -> io::Result<Vec<String>> {
    let mut versions = Versions::default();
    for model in array(context.get("models"), "models")? {
        model_versions(model, &mut versions)?;
    }
    versions.visit(&context["versions"]);
    capture.captured
        .iter()
        .for_each(|component| versions.visit(component));
    capture.dependency_states
        .values()
        .for_each(|state| versions.visit(state));
    Ok(versions.list)
}

/// A model's version and orphaned version names.
fn model_versions(model: &Value, versions: &mut Versions) -> io::Result<()> {
    for field in ["versions", "orphanedVersions"] {
        if let Some(map) = model
            .get(field)
            .filter(|map| !map.is_null())
        {
            object(map)?
                .keys()
                .for_each(|version| versions.add(version));
        }
    }
    Ok(())
}

/// A `Set` of version texts, in insertion order.
#[derive(Default)]
struct Versions {
    list: Vec<String>,
    seen: HashSet<String>,
}

impl Versions {
    fn add(&mut self, version: &str) {
        if self.seen.insert(version.to_string()) {
            self.list.push(version.to_string());
        }
    }

    /// `visit(value)`: `version` and the version of a versioned `identity`,
    /// in every nested object and array.
    fn visit(&mut self, value: &Value) {
        let children: Vec<&Value> = match value {
            Value::Object(map) => {
                if let Some(version) = map.get("version").and_then(Value::as_str) {
                    self.add(version);
                }
                if let Some((_, version)) = map
                    .get("identity")
                    .and_then(Value::as_str)
                    .and_then(|identity| identity.rsplit_once('@'))
                {
                    self.add(version);
                }
                map.values().collect()
            }
            Value::Array(items) => items.iter().collect(),
            _ => return,
        };
        for child in children {
            self.visit(child);
        }
    }
}

/// `resolveComponentReceipts`: each captured component's extensions,
/// package name, environment defaults and dependency state.
pub(super) fn component_receipts(context: &Value, capture: &Capture) -> io::Result<Vec<Value>> {
    let targets = array(context.get("targets"), "targets")?;
    capture.captured
        .iter()
        .map(|component| {
            let identity = text(component.get("identity"))?;
            let target = targets
                .iter()
                .find(|target| target["identity"] == identity)
                .ok_or_else(|| decline("resolve component metadata"))?;
            let state = capture.dependency_states
                .get(identity)
                .ok_or_else(|| decline("resolve component metadata"))?;
            let policy = status_policy::status_policy(context, target)?;
            let files: Vec<String> = array(component.get("files"), "files")?
                .iter()
                .map(|file| text(Some(file)).map(str::to_string))
                .collect::<io::Result<_>>()?;
            let callback = capture::snapshot_data(capture, identity);
            let default_node = if callback.is_some() {
                defaults::callback_receipt(&policy)?
            } else {
                defaults::receipt(target, &policy, &files)?
            };
            Ok(json!({
                "identity": identity,
                "extensions": policy.extensions,
                "packageName": policy.package_name,
                "defaultNode": default_node,
                "dependencyState": state,
                "callbackExtensions": capture::snapshot_data(capture, identity).map(|data| &data["extensions"]),
            }))
        })
        .collect()
}

/// `resolvePatternIds`: the targets the pattern matches (`multimatch`).
/// The engine keeps the matching snap candidates, or for a single id, the
/// id itself (`resolveComponentId`).
fn pattern_ids(context: &Value, pattern: Option<&str>) -> io::Result<Option<Vec<String>>> {
    let Some(pattern) = pattern else { return Ok(None) };
    if !pattern.contains(['*', ',', '!']) {
        let selected = tag::selections(context, &[pattern.to_string()])?
            .ok_or_else(|| decline("snapshot literal selection absent"))?;
        return selected
            .as_array()
            .ok_or_else(|| decline("snapshot literal selection rows"))?
            .iter()
            .map(|row| text(row.get("identity")).map(str::to_owned))
            .collect::<io::Result<Vec<_>>>()
            .map(Some);
    }
    let patterns = patterns::split(pattern);
    if patterns
        .iter()
        .any(|part| part.starts_with('$') || part.contains(" AND "))
    {
        return Err(decline("resolve state selector requires canonical callbacks"));
    }
    let identities: Vec<&str> = array(context.get("targets"), "targets")?
        .iter()
        .map(|target| text(target.get("identity")))
        .collect::<io::Result<_>>()?;
    let selected = patterns::extended::matching(&identities, &patterns)?;
    if selected.is_empty() {
        return Err(decline("resolve pattern has no matches"));
    }
    Ok(Some(
        selected
            .into_iter()
            .map(str::to_string)
            .collect(),
    ))
}

/// `plan.needsSnap`: distinct, non-empty identities.
fn identities(rows: &[Value]) -> io::Result<Vec<String>> {
    let identities: Vec<String> = rows
        .iter()
        .map(|row| text(Some(row)).map(str::to_string))
        .collect::<io::Result<_>>()?;
    let distinct: HashSet<&String> = identities.iter().collect();
    if identities.is_empty()
        || identities.len() > 4096
        || distinct.len() != identities.len()
        || identities
            .iter()
            .any(|id| id.is_empty() || id.len() > 4096)
    {
        return Err(decline("resolve snapshot scalar preparation"));
    }
    Ok(identities)
}

/// The capture the snaps are checked and written against.
struct Resolved<'r> {
    root: &'r Path,
    context: &'r Value,
    capture: &'r Capture,
}

impl Resolved<'_> {
    /// `validateResolveIssues`: no snapped component has a tag blocker.
    fn validate_issues(
        &self,
        needs_snap: &[String],
        issue_graph: Option<&Value>,
        ignored: &Value,
        selected: &Value,
        resolving: bool,
        startup: Option<&mut Startup>,
    ) -> io::Result<()> {
        if ignored == "*" {
            return Ok(());
        }
        let heads = self.context.get("resolveIssueHeads").filter(|heads| heads.is_array());
        let heads = heads.ok_or_else(|| decline("resolve issue head proof receipt absent"))?;
        let graph = issue_graph.filter(|graph| !graph.is_null());
        let found = issues::collect_resolved(
            self.root,
            self.context,
            &self.capture.components,
            heads,
            graph,
        )?
        .ok_or_else(|| decline("resolve issue callback requires canonical loading"))?;
        blockers::callbacks(self, &found, selected, needs_snap, ignored, resolving, startup)
    }

    /// `resolveSnapshotReceipt` with the dependency graphs and lane squash logs.
    fn receipt(
        &self,
        kind: Kind,
        needs_snap: &[String],
        plan: &Value,
        options: &Value,
    ) -> io::Result<Value> {
        let preparation = &plan["scalarPreparation"];
        let lane_history = preparation.get("laneHistory").and_then(Value::as_bool);
        let squash = preparation.get("squash").and_then(Value::as_array);
        let (Some(lane_history), Some(squash)) = (lane_history, squash) else {
            return Err(decline("resolve snapshot scalar preparation"));
        };
        if (!squash.is_empty() && kind != Kind::Resolve) || (kind == Kind::Tag && lane_history) {
            return Err(decline("resolve snapshot squash or lane log"));
        }
        let hashes = receipt::new_snap_hashes(needs_snap.len())?;
        // The graphs name a snap by its hash and a tag by its version.
        let versions = match kind {
            Kind::Snap | Kind::Resolve => hashes.clone(),
            Kind::Tag => tag::planned_versions(&plan["result"], needs_snap)?,
        };
        let graphs = if options["policy"]["noLockDeps"] == true {
            vec![None; needs_snap.len()]
        } else {
            graphs(self.root, self.context, needs_snap, &versions, self.capture)?
        };
        let snapped = receipt::Snapped { identities: needs_snap, hashes: &hashes, graphs: &graphs };
        let mut receipt = receipt::snapshot(self.root, &snapped, lane_history)?;
        squash_logs(&mut receipt, squash)?;
        Ok(receipt)
    }
}

/// `getLogForSquash` for every merged component the resolve snaps.
fn squash_logs(receipt: &mut Value, rows: &[Value]) -> io::Result<()> {
    let mut seen = HashSet::new();
    for row in rows {
        let identity = text(row.get("identity"))?;
        let lane = &row["laneId"];
        let scope = text(lane.get("scope"))?;
        let name = text(lane.get("name"))?;
        let versions = array(receipt.get("versions"), "resolve receipt versions")?;
        if !seen.insert(identity)
            || identity.is_empty()
            || scope.is_empty()
            || name.is_empty()
            || !versions
                .iter()
                .any(|version| version["identity"] == identity)
        {
            return Err(decline("resolve snapshot squash receipt"));
        }
        let mut log = receipt["log"].clone();
        log["message"] = json!(format!("squashed during merge from {scope}/{name}"));
        for version in receipt["versions"].as_array_mut().unwrap() {
            if version["identity"] == identity {
                version["squashLog"] = log.clone();
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod resolve_tests;

impl Planned {
    pub(in crate::commands) fn has_captured_components(&self) -> bool {
        !self.capture.components.is_empty()
    }

    /// Move configured callbacks across native merge materialization and resolution.
    pub(in crate::commands) fn take_environment(&mut self) -> Option<environments::Environments> {
        capture::take_callback_environment(&mut self.capture)
    }
}
