mod autotag;
mod model;
#[cfg(test)]
mod tests;

use super::invalid;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    current_lane_id: String,
    targets: Vec<Target>,
    models: Vec<Value>,
    histories: Vec<Value>,
    semver: Value,
    #[serde(default)]
    unavailable_on_main: Vec<String>,
    #[serde(default)]
    update_dependents: Vec<String>,
    #[serde(default)]
    during_merge: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Target {
    identity: String,
    version: String,
    modified: bool,
    issues: Vec<Value>,
    dependencies: Vec<String>,
    #[serde(default)]
    bitmap_state: BitmapState,
    #[serde(default)]
    invalid: Option<Value>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BitmapState {
    #[serde(default)]
    local_only: bool,
    #[serde(default)]
    soft_tagged: bool,
    #[serde(default)]
    locally_removed: bool,
}

pub(super) fn read(request: &Request) -> io::Result<(usize, Value)> {
    validate(request)?;
    let mut output = empty(&request.current_lane_id);
    output["unavailableOnMain"] = json!(request.unavailable_on_main);
    output["componentsDuringMergeState"] = json!(request.during_merge);
    for target in &request.targets {
        current(&mut output, target);
    }
    for entry in &request.models {
        model::append(&mut output, entry, request)?;
    }
    output["autoTagPendingComponents"] = autotag::pending(request)?;
    Ok((request.targets.len(), output))
}
fn current(output: &mut Value, target: &Target) {
    if let Some(error) = &target.invalid {
        if error["name"] == "ComponentsPendingImport" {
            push(output, "importPendingComponents", json!(target.identity));
        } else {
            push(output, "invalidComponents", json!({"id":target.identity,"error":error}));
        }
        return;
    }
    if target.version.is_empty() {
        push(output, "newComponents", json!(target.identity));
    } else if target.modified {
        push(output, "modifiedComponents", json!(target.identity));
    }
    if !target.issues.is_empty() {
        push(output, "componentsWithIssues", json!({"id":target.identity,"issues":target.issues}));
    }
    if target.bitmap_state.local_only {
        push(output, "localOnly", json!(target.identity));
    }
    if target.bitmap_state.soft_tagged {
        push(output, "softTaggedComponents", json!(target.identity));
    }
    if target.bitmap_state.locally_removed {
        push(output, "locallySoftRemoved", json!(target.identity));
    }
}
fn empty(lane: &str) -> Value {
    let mut output = json!({});
    // Populate every status section; lane-specific rows are filled later.
    for field in [
        "newComponents",
        "modifiedComponents",
        "stagedComponents",
        "unavailableOnMain",
        "componentsWithIssues",
        "importPendingComponents",
        "autoTagPendingComponents",
        "invalidComponents",
        "locallySoftRemoved",
        "remotelySoftRemoved",
        "outdatedComponents",
        "mergePendingComponents",
        "componentsDuringMergeState",
        "softTaggedComponents",
        "snappedComponents",
        "localOnly",
        "pendingUpdatesFromMain",
        "updatesFromForked",
        "workspaceIssues",
        "pendingUpdateDependents",
    ] {
        if field == "workspaceIssues" {
            output["currentLaneId"] = json!(lane);
        }
        output[field] = json!([]);
    }
    output
}
fn push(output: &mut Value, field: &str, value: Value) {
    output[field]
        .as_array_mut()
        .unwrap()
        .push(value);
}
fn validate(request: &Request) -> io::Result<()> {
    if !valid_lane_id(&request.current_lane_id)
        || request.targets.len() > 4096
        || request.models.len() > 4096
        || request.histories.len() != request.models.len()
        || !request.semver.is_object()
    {
        return Err(invalid("status result domain"));
    }
    models(request)?;
    let mut identities = HashSet::new();
    for target in &request.targets {
        grammar(request, target)?;
        if target.identity.trim().is_empty()
            || !identities.insert(target.identity.trim())
            || target.dependencies.len() > 4096
            || target.issues.len() > 4096
        {
            return Err(invalid("status result target"));
        }
    }
    Ok(())
}

fn models(request: &Request) -> io::Result<()> {
    let mut known = HashSet::new();
    let mut histories = HashSet::new();
    for model in &request.models {
        let identity = model::identity(model, request)?;
        if !known.insert(identity) {
            return Err(invalid("status duplicate model"));
        }
    }
    for history in &request.histories {
        let identity =
            history["identity"].as_str().ok_or_else(|| invalid("status history identity"))?;
        if !known.contains(identity) || !histories.insert(identity) {
            return Err(invalid("status duplicate or unknown history"));
        }
    }
    if request.targets
        .iter()
        .any(|target| {
            !target.version.is_empty()
                && !known.contains(&target.identity)
                && target.invalid
                    .as_ref()
                    .is_none_or(|error| error["name"] != "ComponentsPendingImport")
        })
    {
        return Err(invalid("status missing imported model requires canonical errors"));
    }
    Ok(())
}

fn valid_lane_id(lane_id: &str) -> bool {
    lane_id
        .split_once('/')
        .is_some_and(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty())
}

fn grammar(request: &Request, target: &Target) -> io::Result<()> {
    let versions = std::iter::once(target.version.as_str())
        .chain(
            target.dependencies
                .iter()
                .filter_map(|dependency| dependency.rsplit_once('@').map(|(_, version)| version)),
        );
    for version in versions.filter(|version| !version.is_empty()) {
        if !request.semver.get(version).is_some_and(Value::is_object) {
            return Err(invalid("status missing dependency semver grammar"));
        }
    }
    Ok(())
}
