mod issues;

use super::{
    super::{Record, State, invalid, planning},
    projection,
};
use crate::workspace::engine::{dependency_policy::fresh, source_overlay::SourceOverlay};
use issues::capture as capture_issues;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Detect {
    token: String,
    components: Vec<DetectRow>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DetectRow {
    identity: String,
    detection: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    token: String,
    components: Vec<CompleteRow>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompleteRow {
    identity: String,
    policies: Value,
    finish: Value,
    resolution: Value,
    default_node: projection::Defaults,
}

pub(in crate::workspace::engine) fn detect(
    input: Detect,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut record =
        state.record.take().ok_or_else(|| invalid("command dependency owner absent"))?;
    if record.token != input.token {
        return Err(invalid("command dependency token"));
    }
    let mut prepared = record.planned.take().ok_or_else(|| invalid("command dependency plan"))?;
    let overlay = overlay(&record, &prepared.plan)?;
    let policy = prepared.plan.merge
        .as_mut()
        .and_then(|merge| merge.policy.as_mut())
        .ok_or_else(|| invalid("command dependency policy"))?;
    if !policy.config_ready
        || policy.overlay.is_some()
        || input.components.len() != policy.rows.len()
    {
        return Err(invalid("command dependency detect phase"));
    }
    let mut output = Vec::new();
    for (row, receipt) in policy.rows.iter_mut().zip(input.components) {
        output.push(detect_row(row, &receipt, &record, pool, &overlay)?);
    }
    policy.overlay = Some(overlay);
    record.planned = Some(prepared);
    let count = output.len();
    let result = json!({"token":record.token,"components":output});
    state.record = Some(record);
    Ok((count, result))
}

fn detect_row(
    row: &mut super::Row,
    receipt: &DetectRow,
    record: &Record,
    pool: &rayon::ThreadPool,
    overlay: &SourceOverlay,
) -> io::Result<Value> {
    if row.identity != receipt.identity {
        return Err(invalid("command dependency detect identity"));
    }
    let component_root = record.request.root.join(&row.baseline.directory);
    let request = serde_json::from_value(json!({"root":record.request.root,"componentRoot":component_root,
            "identity":format!("{}@{}",row.identity,row.baseline.version),"files":row.files.iter().map(|file| component_root.join(file)).collect::<Vec<_>>(),
            "detection":receipt.detection})).map_err(io::Error::other)?;
    let (_, mut capture) = fresh::detect_overlay(&request, pool, overlay)?;
    let grammar = capture
        .as_object_mut()
        .ok_or_else(|| invalid("command dependency capture"))?
        .remove("grammarInputs")
        .unwrap_or_else(|| json!([]));
    let output = json!({"identity":row.identity,"grammarInputs":grammar});
    row.detected = Some(capture);
    Ok(output)
}

pub(in crate::workspace::engine) fn complete(
    input: Complete,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut record =
        state.record.take().ok_or_else(|| invalid("command dependency owner absent"))?;
    if record.token != input.token {
        return Err(invalid("command dependency token"));
    }
    let mut prepared = record.planned.take().ok_or_else(|| invalid("command dependency plan"))?;
    let completion = {
        let policy = prepared.plan.merge
            .as_mut()
            .and_then(|merge| merge.policy.as_mut())
            .ok_or_else(|| invalid("command dependency policy"))?;
        complete_rows(policy, input.components, &mut record, pool)?
    };
    let count = completion.caches.len();
    let result = complete_plan(&mut prepared.plan, &mut record, completion)?;
    record.planned = Some(prepared);
    state.record = Some(record);
    Ok((count, result))
}

struct Completion {
    caches: Vec<Value>,
    issue_targets: Vec<Value>,
    issues: Vec<Value>,
    visible: HashSet<String>,
}

fn complete_rows(
    policy: &mut super::Prepared,
    receipts: Vec<CompleteRow>,
    record: &mut Record,
    pool: &rayon::ThreadPool,
) -> io::Result<Completion> {
    if receipts.len() != policy.rows.len() {
        return Err(invalid("command dependency completion count"));
    }
    if !policy.config_ready || policy.dependencies_ready {
        return Err(invalid("command dependency completion phase"));
    }
    let overlay =
        policy.overlay.as_ref().ok_or_else(|| invalid("command dependency overlay absent"))?;
    let changed = snapshot_identities(&policy.rows);
    for row in &policy.rows {
        let files = row.files
            .iter()
            .map(|path| json!({"relativePath":path}))
            .collect::<Vec<_>>();
        super::super::merge::snapshot::validate_application_files(&files)?;
    }
    super::graph::validate_previous(&policy.rows, &mut record.repository)?;
    let mut caches = Vec::new();
    let mut issue_targets = Vec::new();
    let mut issues = Vec::new();
    for (row, receipt) in policy.rows.iter_mut().zip(receipts) {
        let (cache, target) =
            complete_row(row, &receipt, record, pool, overlay, &changed, &mut issues)?;
        caches.push(cache);
        issue_targets.push(target);
    }
    let visible = policy.rows
        .iter()
        .filter(|row| !row.fast_forward)
        .map(|row| format!("{}@{}", row.identity, row.baseline.version))
        .collect::<HashSet<_>>();
    policy.dependencies_ready = true;
    Ok(Completion { caches, issue_targets, issues, visible })
}

fn snapshot_identities(rows: &[super::Row]) -> HashSet<String> {
    rows.iter()
        .filter(|row| !row.fast_forward)
        .map(|row| row.identity.clone())
        .collect()
}

fn complete_plan(
    plan: &mut planning::Planned,
    record: &mut Record,
    completion: Completion,
) -> io::Result<Value> {
    let Completion {
        mut caches,
        issue_targets,
        issues,
        visible,
    } = completion;
    let merge = plan.merge.as_mut().ok_or_else(|| invalid("command dependency merge"))?;
    merge.apply_policy_configs()?;
    if issues.is_empty() {
        merge.validate_policy_final(record, &plan.materials, &plan.captured)?;
    } else {
        caches.retain(|cache| {
            cache["identity"]
                .as_str()
                .is_some_and(|id| visible.contains(id))
        });
        merge.cancel_snap();
        plan.result["mergeSnapError"] = json!({"kind":"componentsHaveIssues","components":issues});
    }
    record.proofs = crate::workspace::engine::dependency_graph::proof::unique(std::mem::take(
        &mut record.proofs,
    ));
    record.repository.validate()?;
    super::super::proof::verify(&record.proofs)?;
    let mut result = json!({"token":record.token,"result":plan.result,"dependencyCaches":caches,"issueTargets":issue_targets});
    if let Some(pending) = merge.needs_snap() {
        result["needsSnap"] = json!(pending);
    }
    if !issues.is_empty() {
        result["snapFailed"] = json!(true);
        let mut progress = record.repository.progress();
        progress["loads"] =
            json!([super::workspace_count(&record.context, merge.policy.as_ref())?, visible.len()]);
        progress["snapFailed"] = json!(true);
        result["progress"] = progress;
    }
    Ok(result)
}

fn complete_row(
    row: &mut super::Row,
    receipt: &CompleteRow,
    record: &mut Record,
    pool: &rayon::ThreadPool,
    overlay: &SourceOverlay,
    changed: &HashSet<String>,
    issues: &mut Vec<Value>,
) -> io::Result<(Value, Value)> {
    if row.identity != receipt.identity {
        return Err(invalid("command dependency completion identity"));
    }
    let capture =
        row.detected.take().ok_or_else(|| invalid("command dependency capture absent"))?;
    let request = serde_json::from_value(json!({"root":record.request.root,"componentRoot":record.request.root.join(&row.baseline.directory),
            "capture":capture,"policies":receipt.policies,"finish":receipt.finish,"resolution":receipt.resolution})).map_err(io::Error::other)?;
    let (_, output) = fresh::apply_overlay(&request, pool, overlay)?;
    capture_issues(row, &output["issues"], issues)?;
    project(row, &output["state"], &receipt.default_node, changed)?;
    row.projected["overrides"] = overrides(&receipt.finish["manual"])?;
    super::graph::project(row, &mut record.repository)?;
    let mut read_set = Vec::new();
    for proofs in [&capture["readSet"], &output["readSet"]] {
        read_set.extend(
                serde_json::from_value::<
                    Vec<crate::workspace::engine::dependency_graph::proof::Proof>,
                >(proofs.clone())
                .map_err(io::Error::other)?,
            );
    }
    let read_set = crate::workspace::engine::dependency_graph::proof::unique(read_set);
    record.proofs.extend(read_set.iter().cloned());
    Ok((
        json!({"identity":format!("{}@{}",row.identity,row.baseline.version),"rawData":output["rawData"],"cacheable":output["cacheable"],"readSet":read_set}),
        issues::target(row, &output["state"], &output["issues"])?,
    ))
}

fn overlay(record: &Record, planned: &planning::Planned) -> io::Result<SourceOverlay> {
    let merge = planned.merge.as_ref().ok_or_else(|| invalid("command dependency merge"))?;
    let policy = merge.policy.as_ref().ok_or_else(|| invalid("command dependency rows"))?;
    let mut overlay = SourceOverlay::new(&record.request.root)?;
    for row in &policy.rows {
        let files = overlay_files(row, planned)?;
        let root = record.request.root.join(&row.baseline.directory);
        for file in files {
            overlay.insert_source(
                &root.join(
                    file["relativePath"].as_str().ok_or_else(|| invalid("command overlay path"))?,
                ),
                &file["source"],
            )?;
        }
        let current = planned.captured
            .iter()
            .find(|current| current.target.identity == row.identity)
            .ok_or_else(|| invalid("command overlay capture"))?;
        for file in &current.target.files {
            if !row.files.contains(file) {
                overlay.remove(&root.join(file))?;
            }
        }
    }
    overlay.seal()
}

fn overlay_files<'a>(
    row: &super::Row,
    planned: &'a planning::Planned,
) -> io::Result<&'a Vec<Value>> {
    let matches = |output: &Value| {
        output["id"]
            .as_str()
            .and_then(|id| id.rsplit_once('@'))
            .is_some_and(|(id, _)| id == row.identity)
    };
    if row.fast_forward {
        return planned.materials
            .iter()
            .find(|material| matches(&material.output))
            .map(|material| &material.files)
            .ok_or_else(|| invalid("command FF overlay"));
    }
    planned.merge
        .as_ref()
        .ok_or_else(|| invalid("command merge overlay"))?
        .materials
        .iter()
        .find(|material| matches(&material.output))
        .map(|material| &material.files)
        .ok_or_else(|| invalid("command merge overlay"))
}

fn project(
    row: &mut super::Row,
    state: &Value,
    defaults: &projection::Defaults,
    changed: &HashSet<String>,
) -> io::Result<()> {
    for (field, name) in ["dependencies", "devDependencies", "peerDependencies"].iter().enumerate()
    {
        let mut dependencies = Vec::new();
        for index in projection::array(&state["components"][field])? {
            let entry = &state["entries"]
                [index.as_u64().ok_or_else(|| invalid("command dependency index"))? as usize];
            let dependency = component(entry, changed)?;
            dependencies.push(dependency);
        }
        row.projected[*name] = json!(dependencies);
    }
    for (field, name) in
        ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"]
            .iter()
            .enumerate()
    {
        row.projected[*name] = state["packages"][field].clone();
    }
    row.projected["extensions"] = projection::extensions(
        &row.projected["extensions"],
        &row.projected["extensions"],
        state,
        defaults,
        &row.baseline.package_name,
    )?;
    Ok(())
}

fn component(entry: &Value, changed: &HashSet<String>) -> io::Result<Value> {
    let identity =
        entry["identity"].as_str().ok_or_else(|| invalid("command dependency identity"))?;
    let (base, version) =
        identity.rsplit_once('@').ok_or_else(|| invalid("command dependency version"))?;
    if changed.contains(base) {
        return Err(invalid("command new merged dependency cascade"));
    }
    let (scope, name) = base.split_once('/').ok_or_else(|| invalid("command dependency scope"))?;
    let id = json!({"scope":scope,"name":name,"version":version});
    let mut dependency = json!({"id":id,"relativePaths":[]});
    if let Some(name) = entry["packageName"].as_str() {
        dependency["packageName"] = json!(name);
    }
    if let Some(range) = entry["versionRange"].as_str() {
        dependency["versionRange"] = json!(range);
    }
    Ok(dependency)
}

fn overrides(manual: &Value) -> io::Result<Value> {
    let rows = projection::array(manual)?;
    if rows.len() != 3 {
        return Err(invalid("command manual policy count"));
    }
    let mut output = serde_json::Map::new();
    for (name, row) in ["dependencies", "devDependencies", "peerDependencies"].iter().zip(rows) {
        if !row
            .as_object()
            .ok_or_else(|| invalid("command manual policy map"))?
            .is_empty()
        {
            output.insert((*name).to_owned(), row.clone());
        }
    }
    Ok(Value::Object(output))
}

#[cfg(test)]
mod tests;
