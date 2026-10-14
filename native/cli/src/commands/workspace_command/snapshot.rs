//! The snapshot step of a merge (`commandSnapshotReceipt` and
//! `commandFinalize`): when the merge snaps, the whole workspace
//! is captured again with a fresh dependency cache, the issues that block a
//! snap are checked against the engine's prediction, and the engine writes
//! the snaps with new hashes and the user's log.

pub(super) mod receipt;

mod graph;
mod issues;

use super::{Request, Steps, defaults::app_file};
use crate::commands::status::{
    capture::{self, Capture, CaptureOptions},
    fresh::Pending,
    js::{array, decline, text, truthy, without_version},
};
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::Path};

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
        self.supported(request, snap_failed, &needs_snap)?;
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
        // The lane step comes before the snapshot identities are allocated.
        if let Some(preparation) = plan
            .as_object_mut()
            .and_then(|plan| plan.remove("lanePreparation"))
        {
            self.finalize_lane(plan, &preparation)?;
        }
        if !snap_failed {
            *plan = self.finalize(&needs_snap, &capture)?;
        }
        Ok(capture)
    }

    /// The snapshots the native step writes: merges that snap, not lane
    /// merges without auto-snap, nor lane snaps of hidden components or
    /// that fail.
    fn supported(
        &self,
        request: &Request<'_>,
        snap_failed: bool,
        needs_snap: &[String],
    ) -> io::Result<()> {
        let options = &request.options;
        let lane = options.get("lane");
        let no_auto_snap = lane.is_some_and(|lane| truthy(lane.get("noAutoSnap")));
        if request.operation != "merge" || truthy(options.get("noSnap")) || no_auto_snap {
            return Err(decline("command snapshot options"));
        }
        if lane.is_some() && (snap_failed || hidden_only(self.context, needs_snap)) {
            return Err(decline("command lane snapshot of hidden or failed components"));
        }
        Ok(())
    }

    /// `commandSnapshotReceipt` and `commandFinalize`: the finalized plan.
    fn finalize(&mut self, needs_snap: &[String], capture: &Capture) -> io::Result<Value> {
        let hashes = receipt::new_snap_hashes(needs_snap.len())?;
        let graphs = graphs(self.root, self.context, needs_snap, &hashes, capture)?;
        let snapped = receipt::Snapped { identities: needs_snap, hashes: &hashes, graphs: &graphs };
        let lane_log = truthy(self.context["lane"].get("current"));
        let mut receipt = receipt::snapshot(self.root, &snapped, lane_log)?;
        if truthy(self.context["lane"].get("shouldSquash")) {
            squash_logs(&mut receipt, self.context)?;
        }
        let finalized: Value = self.engine.request(&json!({
            "kind": "commandFinalize",
            "token": self.token,
            "snapReceipt": receipt,
            "dependencyReadSet": capture.dependency_read_set(),
        }))?;
        if finalized.get("token").and_then(Value::as_str) != Some(self.token) {
            return Err(decline("command finalize receipt"));
        }
        Ok(finalized)
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
            ..Default::default()
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

/// The dependency graph of each component the snap writes.
pub(super) fn graphs(
    root: &Path,
    context: &Value,
    needs_snap: &[String],
    hashes: &[String],
    capture: &Capture,
) -> io::Result<Vec<Option<String>>> {
    let targets = array(context.get("targets"), "targets")?;
    let snapped = needs_snap
        .iter()
        .map(|identity| {
            let target = targets
                .iter()
                .find(|target| target.get("identity").and_then(Value::as_str) == Some(identity))
                .ok_or_else(|| decline("command snapshot target"))?;
            let directory = text(target.get("directory"))?;
            Ok(graph::Snapped { directory, package_name: package_name(capture, identity)? })
        })
        .collect::<io::Result<Vec<_>>>()?;
    let components = workspace_components(targets, needs_snap, hashes, capture)?;
    graph::graphs(root, &snapped, &components)
}

/// `componentIdByPkgName`: the snapped components under their new hashes,
/// then the others under their workspace versions.
fn workspace_components<'c>(
    targets: &'c [Value],
    needs_snap: &'c [String],
    hashes: &'c [String],
    capture: &'c Capture,
) -> io::Result<Vec<graph::WorkspaceComponent<'c>>> {
    let mut components = needs_snap
        .iter()
        .zip(hashes)
        .map(|(identity, hash)| {
            let package_name = package_name(capture, identity)?;
            Ok(graph::WorkspaceComponent { package_name, identity, version: Some(hash) })
        })
        .collect::<io::Result<Vec<_>>>()?;
    for target in targets {
        let identity = text(target.get("identity"))?;
        if needs_snap
            .iter()
            .any(|snapped| snapped == identity)
        {
            continue;
        }
        let version = target
            .get("version")
            .and_then(Value::as_str)
            .filter(|version| !version.is_empty());
        components.push(graph::WorkspaceComponent {
            package_name: package_name(capture, identity)?,
            identity,
            version,
        });
    }
    Ok(components)
}

/// The package name of a captured component.
fn package_name<'c>(capture: &'c Capture, identity: &str) -> io::Result<&'c str> {
    capture.components
        .iter()
        .find(|component| without_version(&component.identity) == identity)
        .map(|component| component.package_name.as_str())
        .ok_or_else(|| decline("command snapshot component"))
}

/// A lane merge whose snaps are all hidden lane components, absent from
/// the bitmap: they are scope-only snapshots.
fn hidden_only(context: &Value, needs_snap: &[String]) -> bool {
    let targets = context["lane"]["targets"].as_array();
    !needs_snap.is_empty()
        && needs_snap
            .iter()
            .all(|identity| {
                targets.is_some_and(|targets| {
                    targets
                        .iter()
                        .any(|target| {
                            target["identity"] == identity.as_str()
                                && target["hidden"] == true
                                && target["bitmapPresent"] == false
                        })
                })
            })
}

/// `squashLog` per version: `getLogForSquash(commandOtherLane(context,
/// identity))`, the merged lane, or main in the component's scope.
fn squash_logs(receipt: &mut Value, context: &Value) -> io::Result<()> {
    let other = &context["lane"]["otherId"];
    let (Some(name), Some(scope)) = (
        other["name"]
            .as_str()
            .filter(|name| !name.is_empty()),
        other["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty()),
    ) else {
        return Err(decline("command lane identity receipt"));
    };
    let log = receipt["log"].clone();
    for version in receipt["versions"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        let identity = text(version.get("identity"))?;
        let own_scope = identity
            .split_once('/')
            .map(|(scope, _)| scope)
            .filter(|scope| !scope.is_empty());
        let own_scope = own_scope.ok_or_else(|| decline("command lane component identity"))?;
        let lane_scope = if name == "main" { own_scope } else { scope };
        let mut squash = log.clone();
        squash["message"] = json!(format!("squashed during merge from {lane_scope}/{name}"));
        version["squashLog"] = squash;
    }
    Ok(())
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
