//! The snapshot step of a merge (`captureForSnapshot`,
//! `commandSnapshotReceipt` and `commandFinalize` in
//! `rust-workspace-command.ts`): when the merge snaps, the whole workspace
//! is captured again with a fresh dependency cache, the issues that block a
//! snap are checked against the engine's prediction, and the engine writes
//! the snaps with new hashes and the user's log.

mod graph;
mod issues;
mod receipt;

use super::{Request, Steps, defaults::app_file};
use crate::commands::status::{
    capture::{self, Capture, CaptureOptions},
    fresh::Pending,
    js::{array, decline, text, truthy, without_version},
};
use serde_json::{Value, json};
use std::{collections::HashMap, io};

impl Steps<'_> {
    /// The plan's snapshot step: a new capture, and unless the engine
    /// predicted the snap fails, the finalized plan.
    pub(super) fn prepare_snapshot(
        &mut self,
        plan: &mut Value,
        caches: &[Pending],
        request: &Request<'_>,
    ) -> io::Result<Capture> {
        let snap_failed = plan.get("snapFailed") == Some(&Value::Bool(true));
        let needs_snap = needs_snap(plan, snap_failed)?;
        let options = &request.options;
        if request.operation != "merge"
            || truthy(options.get("noSnap"))
            || options.get("lane").is_some()
        {
            return Err(decline("command snapshot options"));
        }
        // Failed issue checks repopulate only the divergent targets' staged caches.
        if snap_failed && caches.is_empty() {
            return Err(decline("command failed snapshot without dependency caches"));
        }
        let context = self.snapshot_context(caches)?;
        let capture = self.snapshot_capture(&context, plan)?;
        if !snap_failed && depends_on(&capture, &needs_snap) {
            return Err(decline("command snapshot dependents"));
        }
        issues::validate(self.root, &context, &capture.components, plan)?;
        if !snap_failed {
            let graphs = self.graphs(&needs_snap, &capture)?;
            let receipt = receipt::snapshot(self.root, &needs_snap, &graphs, self.context)?;
            let finalized: Value = self.engine.request(&json!({
                "kind": "commandFinalize",
                "token": self.token,
                "snapReceipt": receipt,
                "dependencyReadSet": capture.dependency_read_set(),
            }))?;
            if finalized.get("token").and_then(Value::as_str) != Some(self.token) {
                return Err(decline("command finalize receipt"));
            }
            *plan = finalized;
        }
        Ok(capture)
    }

    /// The dependency graph of each component the merge snaps.
    fn graphs(&self, needs_snap: &[String], capture: &Capture) -> io::Result<Vec<Option<String>>> {
        let targets = array(self.context.get("targets"), "targets")?;
        let snapped = needs_snap
            .iter()
            .map(|identity| {
                let target = targets
                    .iter()
                    .find(|target| target.get("identity").and_then(Value::as_str) == Some(identity))
                    .ok_or_else(|| decline("command snapshot target"))?;
                let component = capture.components
                    .iter()
                    .find(|component| without_version(&component.identity) == identity)
                    .ok_or_else(|| decline("command snapshot component"))?;
                Ok(graph::Snapped {
                    directory: text(target.get("directory"))?,
                    package_name: &component.package_name,
                })
            })
            .collect::<io::Result<Vec<_>>>()?;
        let packages = capture.components
            .iter()
            .map(|component| component.package_name.as_str())
            .collect();
        graph::graphs(self.root, &snapped, &packages)
    }

    /// The context with the lane's inactive targets the merge activated.
    fn snapshot_context(&self, caches: &[Pending]) -> io::Result<Value> {
        let activated: Vec<&str> = caches
            .iter()
            .map(|entry| {
                entry
                    .identity()
                    .rsplit_once('@')
                    .map_or_else(|| entry.identity(), |(identity, _)| identity)
            })
            .collect();
        let mut targets = array(self.context.get("targets"), "targets")?.to_vec();
        if let Some(inactive) = self.context["lane"]
            .get("inactiveTargets")
            .filter(|value| !value.is_null())
        {
            targets.extend(
                array(Some(inactive), "inactive targets")?
                    .iter()
                    .filter(|target| {
                        target
                            .get("identity")
                            .and_then(Value::as_str)
                            .is_some_and(|id| activated.contains(&id))
                    })
                    .cloned(),
            );
        }
        let mut context = self.context.clone();
        context["targets"] = Value::Array(targets);
        Ok(context)
    }

    /// Every target captured again: cached dependencies verified, the
    /// dependency cache reset, and app components left to Node.
    fn snapshot_capture(&mut self, context: &Value, plan: &Value) -> io::Result<Capture> {
        let targets = array(context.get("targets"), "targets")?;
        let options = CaptureOptions {
            verify: true,
            reset: true,
            cache_versions: cache_versions(plan.get("dependencyCacheVersions"), targets)?,
        };
        let capture =
            capture::capture_with(self.engine, self.root, self.home, context, targets, options)?;
        let files = capture.captured
            .iter()
            .flat_map(|component| {
                component["files"]
                    .as_array()
                    .into_iter()
                    .flatten()
            });
        if files.filter_map(Value::as_str).any(app_file) {
            return Err(decline("command snapshot app components"));
        }
        Ok(capture)
    }
}

/// `plan.needsSnap`: the identities to snap, absent when the snap failed.
fn needs_snap(plan: &Value, snap_failed: bool) -> io::Result<Vec<String>> {
    if snap_failed {
        if plan.get("needsSnap").is_some() || plan["result"].get("mergeSnapError").is_none() {
            return Err(decline("command failed snapshot receipt"));
        }
        return Ok(Vec::new());
    }
    let identities = plan.get("needsSnap").and_then(Value::as_array);
    let identities = identities.filter(|identities| identities.len() <= 4096);
    identities
        .ok_or_else(|| decline("command snapshot receipt"))?
        .iter()
        .map(|identity| {
            let identity = text(Some(identity))?;
            if identity.len() > 4096 {
                return Err(decline("command snapshot identity"));
            }
            Ok(identity.to_string())
        })
        .collect()
}

/// `cacheVersionUpdates`: each target's version at most once, a semver
/// version or a snap hash.
fn cache_versions(value: Option<&Value>, targets: &[Value]) -> io::Result<HashMap<String, String>> {
    let updates = match value {
        None => return Ok(HashMap::new()),
        Some(updates) => array(Some(updates), "cache versions")?,
    };
    if updates.len() > targets.len() {
        return Err(decline("command cache version receipt"));
    }
    let mut versions = HashMap::new();
    for update in updates {
        let identity = text(update.get("identity"))?;
        let version = text(update.get("version"))?;
        let known = targets
            .iter()
            .any(|target| target.get("identity").and_then(Value::as_str) == Some(identity));
        let hash = version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit());
        let valid = hash || node_semver::npm::valid(version).is_some();
        if !known || versions.contains_key(identity) || version.len() > 256 || !valid {
            return Err(decline("command cache version receipt"));
        }
        versions.insert(identity.to_string(), version.to_string());
    }
    Ok(versions)
}

/// Whether a captured component depends on a component the merge snaps:
/// its dependents would be auto-snapped, which Node computes.
fn depends_on(capture: &Capture, needs_snap: &[String]) -> bool {
    capture.captured
        .iter()
        .any(|component| {
            ["dependencies", "devDependencies"]
                .iter()
                .any(|field| {
                    let dependencies = component["current"][field]
                        .as_array()
                        .into_iter()
                        .flatten();
                    dependencies
                        .filter_map(dependency_identity)
                        .any(|identity| needs_snap.contains(&identity))
                })
        })
}

/// `<scope>/<name>` of a dependency's id.
fn dependency_identity(dependency: &Value) -> Option<String> {
    let id = &dependency["id"];
    Some(format!("{}/{}", id["scope"].as_str()?, id["name"].as_str()?))
}
