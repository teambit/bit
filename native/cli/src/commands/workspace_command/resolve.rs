//! The resolve commands of the Node.js glue (`rust-workspace-snap.ts`,
//! `rust-workspace-resolve-metadata.ts`, `rust-workspace-resolve-receipt.ts`):
//! `bit snap` planned by the engine's `commandSnap*` requests, on top of the
//! status capture and the snapshot receipt merges use.

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

/// What `bit snap` asks for.
pub struct SnapRequest<'r> {
    /// `RustWorkspaceSnapOptions`, as the engine reads them.
    pub options: Value,
    pub pattern: Option<&'r str>,
    pub unmerged: bool,
}

/// `readRustWorkspaceSnap` up to the commit: the plan, and unless there is
/// nothing to snap, the finalized snaps.
pub fn plan_snap(root: &Path, request: &SnapRequest<'_>) -> io::Result<Planned> {
    if cache::no_fs_cache(root) {
        return Err(decline("no-fs-cache may be enabled"));
    }
    let mut snap = Snap::prepare(root, &request.options)?;
    let plan = snap.plan(request)?;
    let needs_snap = array(plan.get("needsSnap"), "needs snap")?;
    if plan.get("noop") == Some(&Value::Bool(true)) {
        if !plan["result"].is_null() || !needs_snap.is_empty() {
            return Err(decline("native snap noop receipt"));
        }
        return Ok(snap.planned(plan));
    }
    let needs_snap = identities(needs_snap)?;
    let plan = snap.finalize(&plan, &needs_snap)?;
    snap.capture.cache.force_reset();
    Ok(snap.planned(plan))
}

/// One snap's engine session and capture.
struct Snap<'r> {
    root: &'r Path,
    engine: Engine,
    token: String,
    context: Value,
    capture: Capture,
}

impl<'r> Snap<'r> {
    /// `commandSnapPrepare` and the capture of its targets.
    fn prepare(root: &'r Path, options: &Value) -> io::Result<Self> {
        let home = home();
        let mut engine = Engine::new()?;
        let prepared: Value = engine.request(&json!({
            "kind": "commandSnapPrepare",
            "root": root,
            "home": home,
            "options": options,
            "dependencyGrammar": dependency_grammar()?,
            "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
        }))?;
        validate_preparation(&prepared)?;
        let token = text(prepared.get("token"))?.to_string();
        let context = prepared["context"].clone();
        let targets = array(prepared.get("targets"), "targets")?;
        let verify = CaptureOptions { verify: true, ..CaptureOptions::default() };
        let capture = capture::capture_with(&mut engine, root, &home, &context, targets, verify)?;
        Ok(Self { root, engine, token, context, capture })
    }

    /// `commandSnapPlan`.
    fn plan(&mut self, request: &SnapRequest<'_>) -> io::Result<Value> {
        let mut plan_request = json!({
            "kind": "commandSnapPlan",
            "token": self.token,
            "current": self.capture.captured,
            "dependencyReadSet": self.capture.dependency_read_set(),
            "semver": semver(&self.context, &self.capture)?,
            "components": component_receipts(&self.context, &self.capture)?,
        });
        if !request.unmerged
            && let Some(ids) = pattern_ids(&self.context, request.pattern)?
        {
            plan_request["selectedIds"] = json!(ids);
        }
        let plan: Value = self.engine.request(&plan_request)?;
        check_token(&plan, &self.token)?;
        Ok(plan)
    }

    /// The issue check, the receipt and `commandSnapFinalize`: the result
    /// and progress to report.
    fn finalize(&mut self, plan: &Value, needs_snap: &[String]) -> io::Result<Value> {
        let resolved = Resolved { root: self.root, context: &self.context, capture: &self.capture };
        resolved.validate_issues(needs_snap, plan.get("issueGraph"))?;
        let receipt = resolved.receipt(needs_snap, &plan["scalarPreparation"])?;
        let finalized: Value = self.engine.request(&json!({
            "kind": "commandSnapFinalize",
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
        let Self { engine, token, context, capture, .. } = self;
        Planned { engine, token, context, capture, plan, apply: "commandSnapApply" }
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

/// `resolveSemver`: every version the models, the context's versions, the
/// capture and the dependency states mention.
fn semver(context: &Value, capture: &Capture) -> io::Result<Value> {
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
    grammar::snapshot(versions.list.iter().map(String::as_str))
        .ok_or_else(|| decline("semver grammar limits"))
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
    fn receipt(&self, needs_snap: &[String], preparation: &Value) -> io::Result<Value> {
        let lane_history = preparation.get("laneHistory").and_then(Value::as_bool);
        let squash = preparation.get("squash").and_then(Value::as_array);
        let (Some(lane_history), Some(squash)) = (lane_history, squash) else {
            return Err(decline("resolve snapshot scalar preparation"));
        };
        if !squash.is_empty() {
            return Err(decline("resolve snapshot squash log"));
        }
        let hashes = receipt::new_snap_hashes(needs_snap.len())?;
        let graphs = graphs(self.root, self.context, needs_snap, &hashes, self.capture)?;
        let snapped = receipt::Snapped { identities: needs_snap, hashes: &hashes, graphs: &graphs };
        receipt::snapshot(self.root, &snapped, lane_history)
    }
}

#[cfg(test)]
mod resolve_tests;
