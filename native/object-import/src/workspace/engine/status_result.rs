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
    invalid: Option<Value>,
}

pub(super) fn read(request: &Request) -> io::Result<(usize, Value)> {
    validate(request)?;
    let mut output = empty(&request.current_lane_id);
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
        push(output, "invalidComponents", json!({"id":target.identity,"error":error}));
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
}
fn empty(lane: &str) -> Value {
    let mut output = json!({});
    // Complex lane states still decline during context loading. These sections
    // are empty for ordinary current lanes as well as the main lane.
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
    if request.current_lane_id.split_once('/').is_none()
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
        if target.identity.is_empty()
            || !identities.insert(&target.identity)
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
        let identity = model::identity(model)?;
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
        .any(|target| !target.version.is_empty() && !known.contains(&target.identity))
    {
        return Err(invalid("status missing imported model requires canonical errors"));
    }
    Ok(())
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
