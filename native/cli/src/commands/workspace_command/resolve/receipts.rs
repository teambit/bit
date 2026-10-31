//! Snapshot receipts, semver collection, preparation validation, and squash logs.

use super::{
    Kind, blockers, defaults,
    snapshot::{graphs, receipt},
    tag,
};
use crate::commands::{
    patterns,
    status::{
        autosync::Startup,
        capture::{self, Capture},
        issues,
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

pub(super) fn check_token(receipt: &Value, token: &str) -> io::Result<()> {
    if receipt.get("token").and_then(Value::as_str) == Some(token) {
        Ok(())
    } else {
        Err(decline("resolve token"))
    }
}

/// The automatic dependents from the resolve plan, with hashes allocated in
/// the same receipt that the engine commits. This is for the enclosing merge
/// report; the standalone `merge --resolve` result keeps its Node shape.
pub(super) fn auto_snap_report(plan: &Value, receipt: &Value) -> io::Result<Vec<Value>> {
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
pub(super) fn validate_preparation(prepared: &Value, kind: Kind) -> io::Result<()> {
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
pub(super) fn semver_values(context: &Value, capture: &Capture) -> io::Result<Vec<String>> {
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
pub(super) struct Versions {
    pub(super) list: Vec<String>,
    seen: HashSet<String>,
}

impl Versions {
    fn add(&mut self, version: &str) {
        let version = version.trim();
        if !version.is_empty() && self.seen.insert(version.to_string()) {
            self.list.push(version.to_string());
        }
    }

    /// `visit(value)`: `version` and the version of a versioned `identity`,
    /// in every nested object and array.
    pub(super) fn visit(&mut self, value: &Value) {
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
pub(in crate::commands::workspace_command) fn component_receipts(
    context: &Value,
    capture: &Capture,
) -> io::Result<Vec<Value>> {
    let targets = array(context.get("targets"), "targets")?;
    capture
        .captured
        .iter()
        .map(|component| {
            let identity = text(component.get("identity"))?;
            let target = targets
                .iter()
                .find(|target| target["identity"] == identity)
                .ok_or_else(|| decline("resolve component metadata"))?;
            let state = capture
                .dependency_states
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
pub(super) fn pattern_ids(
    context: &Value,
    pattern: Option<&str>,
) -> io::Result<Option<Vec<String>>> {
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
pub(super) fn identities(rows: &[Value]) -> io::Result<Vec<String>> {
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
pub(super) struct Resolved<'r> {
    pub(super) root: &'r Path,
    pub(super) context: &'r Value,
    pub(super) capture: &'r Capture,
}

impl Resolved<'_> {
    /// `validateResolveIssues`: no snapped component has a tag blocker.
    pub(super) fn validate_issues(
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
    pub(super) fn receipt(
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
pub(super) fn squash_logs(receipt: &mut Value, rows: &[Value]) -> io::Result<()> {
    let mut seen = HashSet::new();
    for row in rows {
        let identity = text(row.get("identity"))?;
        let (scope, name) = squash_lane_id(&row["laneId"])?;
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
        for version in
            receipt["versions"].as_array_mut().ok_or_else(|| decline("resolve receipt versions"))?
        {
            if version["identity"] == identity {
                version["squashLog"] = log.clone();
            }
        }
    }
    Ok(())
}

fn squash_lane_id(lane: &Value) -> io::Result<(&str, &str)> {
    if let Some(raw) = lane.as_str() {
        return raw
            .split('@')
            .next()
            .unwrap_or(raw)
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .ok_or_else(|| decline("resolve snapshot squash receipt"));
    }
    Ok((text(lane.get("scope"))?.trim(), text(lane.get("name"))?.trim()))
}
