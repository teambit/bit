//! The resolve commands of the Node.js glue (`rust-workspace-snap.ts`,
//! `rust-workspace-resolve-metadata.ts`, `rust-workspace-resolve-receipt.ts`):
//! `bit snap` planned by the engine's `commandSnap*` requests, on top of the
//! status capture and the snapshot receipt merges use.

mod tag;

use super::{
    Planned, defaults, home,
    snapshot::{graphs, receipt},
};
use crate::commands::{
    engine::Engine,
    status::{
        cache,
        capture::{self, Capture, CaptureOptions},
        fresh::dependency_grammar,
        grammar, issues,
        js::{array, decline, object, text, truthy},
        policy,
    },
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

/// `bit snap` or `bit tag`: the engine's `commandSnap*` or `commandTag*`.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Snap,
    Tag,
}

impl Kind {
    fn request(self, step: &str) -> String {
        match self {
            Self::Snap => format!("commandSnap{step}"),
            Self::Tag => format!("commandTag{step}"),
        }
    }
}

/// Which components the command selects.
pub enum Selection<'r> {
    /// `bit snap [component-id]`, or the components during a merge.
    Snap { pattern: Option<&'r str>, unmerged: bool },
    /// `bit tag [patterns...]`: the tag options, the patterns and `--ver`.
    Tag { tag_options: Value, patterns: &'r [String], exact_version: Option<&'r str> },
}

/// What a resolve command asks for.
pub struct ResolveRequest<'r> {
    pub kind: Kind,
    /// The command's `options`, as the engine reads them.
    pub options: Value,
    pub selection: Selection<'r>,
}

/// `readRustWorkspaceSnap` and `readRustWorkspaceTag` up to the commit:
/// the plan, and unless there is nothing to do, the finalized versions.
pub fn plan(root: &Path, request: &ResolveRequest<'_>) -> io::Result<Planned> {
    if cache::no_fs_cache(root) {
        return Err(decline("no-fs-cache may be enabled"));
    }
    let mut session = Session::prepare(root, request)?;
    let plan = session.plan(request)?;
    let needs_snap = array(plan.get("needsSnap"), "needs snap")?;
    if plan.get("noop") == Some(&Value::Bool(true)) {
        if !plan["result"].is_null() || !needs_snap.is_empty() {
            return Err(decline("native snap noop receipt"));
        }
        return Ok(session.planned(plan));
    }
    let needs_snap = identities(needs_snap)?;
    let plan = session.finalize(&plan, &needs_snap)?;
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
}

impl<'r> Session<'r> {
    /// `command*Prepare` and the capture of its targets.
    fn prepare(root: &'r Path, request: &ResolveRequest<'_>) -> io::Result<Self> {
        let home = home();
        let mut engine = Engine::new()?;
        let mut prepare = json!({
            "kind": request.kind.request("Prepare"),
            "root": root,
            "home": home,
            "options": request.options,
            "dependencyGrammar": dependency_grammar()?,
            "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
        });
        if let Selection::Tag { tag_options, .. } = &request.selection {
            prepare["tagOptions"] = tag_options.clone();
        }
        let prepared: Value = engine.request(&prepare)?;
        validate_preparation(&prepared)?;
        let token = text(prepared.get("token"))?.to_string();
        let context = prepared["context"].clone();
        let targets = array(prepared.get("targets"), "targets")?;
        let verify = CaptureOptions { verify: true, ..CaptureOptions::default() };
        let capture = capture::capture_with(&mut engine, root, &home, &context, targets, verify)?;
        Ok(Self { root, kind: request.kind, engine, token, context, capture })
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
            Selection::Snap { pattern, unmerged } => {
                if !unmerged && let Some(ids) = pattern_ids(&self.context, *pattern)? {
                    plan_request["selectedIds"] = json!(ids);
                }
            }
            Selection::Tag { patterns, exact_version, .. } => {
                let selections = tag::selections(&self.context, patterns)?;
                versions.extend(exact_version.iter().map(ToString::to_string));
                versions.extend(tag::entered_versions(selections.as_ref()));
                if let Some(selections) = selections {
                    plan_request["tagSelections"] = selections;
                }
            }
        }
        plan_request["semver"] = grammar::snapshot(versions.iter().map(String::as_str))
            .ok_or_else(|| decline("semver grammar limits"))?;
        let plan: Value = self.engine.request(&plan_request)?;
        check_token(&plan, &self.token)?;
        Ok(plan)
    }

    /// The issue check, the receipt and `command*Finalize`: the result and
    /// progress to report.
    fn finalize(&mut self, plan: &Value, needs_snap: &[String]) -> io::Result<Value> {
        let resolved = Resolved { root: self.root, context: &self.context, capture: &self.capture };
        resolved.validate_issues(needs_snap, plan.get("issueGraph"))?;
        let receipt = resolved.receipt(self.kind, needs_snap, plan)?;
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
        Ok(json!({ "result": finalized["result"], "progress": progress }))
    }

    fn planned(self, plan: Value) -> Planned {
        let apply = match self.kind {
            Kind::Snap => "commandSnapApply",
            Kind::Tag => "commandTagApply",
        };
        let Self { engine, token, context, capture, .. } = self;
        Planned { engine, token, context, capture, plan, apply }
    }
}

fn check_token(receipt: &Value, token: &str) -> io::Result<()> {
    if receipt.get("token").and_then(Value::as_str) == Some(token) {
        Ok(())
    } else {
        Err(decline("resolve token"))
    }
}

/// `validatePreparation`: the context's targets are the targets, and the
/// selected ids are distinct targets.
fn validate_preparation(prepared: &Value) -> io::Result<()> {
    let targets = prepared.get("targets").and_then(Value::as_array);
    let selected = prepared.get("selectedIds").and_then(Value::as_array);
    let (Some(targets), Some(selected)) = (targets, selected) else {
        return Err(decline("resolve preparation receipt"));
    };
    if !prepared["token"].is_string()
        || !truthy(prepared.get("context"))
        || targets.len() > 4096
        || selected.len() > 4096
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
fn component_receipts(context: &Value, capture: &Capture) -> io::Result<Vec<Value>> {
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
            let policy = policy::status_policy(context, target)?;
            let files: Vec<String> = array(component.get("files"), "files")?
                .iter()
                .map(|file| text(Some(file)).map(str::to_string))
                .collect::<io::Result<_>>()?;
            Ok(json!({
                "identity": identity,
                "extensions": policy.extensions,
                "packageName": policy.package_name,
                "defaultNode": defaults::receipt(target, &policy, &files)?,
                "dependencyState": state,
            }))
        })
        .collect()
}

/// `resolvePatternIds` for a single component id, which `bit snap`
/// resolves directly (`resolveComponentId`), modified or not. Globs, lists
/// and versions are filtered among the tag-pending components in Node:
/// they decline.
fn pattern_ids(context: &Value, pattern: Option<&str>) -> io::Result<Option<Vec<String>>> {
    let Some(pattern) = pattern else { return Ok(None) };
    let literal = !pattern.is_empty()
        && pattern
            .chars()
            .all(|character| {
                character.is_ascii_lowercase()
                    || character.is_ascii_digit()
                    || "_./-".contains(character)
            });
    if !literal {
        return Err(decline("resolve pattern outside the native grammar"));
    }
    let known = array(context.get("targets"), "targets")?
        .iter()
        .any(|target| target["identity"] == pattern);
    if !known {
        return Err(decline("resolve pattern has no matches"));
    }
    Ok(Some(vec![pattern.to_string()]))
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
    ) -> io::Result<()> {
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
        let blocked = found
            .iter()
            .any(|component| {
                component["id"]
                    .as_str()
                    .is_some_and(|id| {
                        needs_snap
                            .iter()
                            .any(|snapped| snapped == id)
                    })
                    && component["issues"]
                        .as_array()
                        .is_some_and(|issues| {
                            issues
                                .iter()
                                .any(|issue| issue["isTagBlocker"] == true)
                        })
            });
        if blocked {
            return Err(decline("resolve snapshot issues"));
        }
        Ok(())
    }

    /// `resolveSnapshotReceipt` with the dependency graphs: squashing
    /// declines.
    fn receipt(&self, kind: Kind, needs_snap: &[String], plan: &Value) -> io::Result<Value> {
        let preparation = &plan["scalarPreparation"];
        let lane_history = preparation.get("laneHistory").and_then(Value::as_bool);
        let squash = preparation.get("squash").and_then(Value::as_array);
        let (Some(lane_history), Some(squash)) = (lane_history, squash) else {
            return Err(decline("resolve snapshot scalar preparation"));
        };
        if !squash.is_empty() || (kind == Kind::Tag && lane_history) {
            return Err(decline("resolve snapshot squash or lane log"));
        }
        let hashes = receipt::new_snap_hashes(needs_snap.len())?;
        // The graphs name a snap by its hash and a tag by its version.
        let versions = match kind {
            Kind::Snap => hashes.clone(),
            Kind::Tag => tag::planned_versions(&plan["result"], needs_snap)?,
        };
        let graphs = graphs(self.root, self.context, needs_snap, &versions, self.capture)?;
        let snapped = receipt::Snapped { identities: needs_snap, hashes: &hashes, graphs: &graphs };
        receipt::snapshot(self.root, &snapped, lane_history)
    }
}

#[cfg(test)]
mod resolve_tests;
