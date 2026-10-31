//! Retain dependency prefetch before the canonical workspace graph class loads.
#[cfg(test)]
mod tests;

use super::{Prepare, Target, invalid};
use crate::{
    command_import::PreparedImport,
    workspace::engine::command::{State, proof},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io};

pub(in super::super) struct Pending {
    input: Prepare,
    roots: Vec<Target>,
    targets: Vec<Target>,
    progress_count: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    token: String,
    graph: Graph,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Graph {
    rows: Vec<Value>,
    read_set: Vec<proof::Proof>,
}

pub(in super::super) fn needed(input: &Prepare) -> bool {
    let options = &input.options.dependencies.dependents;
    options.enabled || !options.via.is_empty()
}

pub(in super::super) fn begin(
    input: &Prepare,
    roots: Vec<Target>,
    targets: Vec<Target>,
    import: PreparedImport,
    state: &mut State,
    token: String,
) -> io::Result<(usize, Value)> {
    let progress = super::super::progress::rows(
        &import,
        &roots,
        input.options.dependencies.dependencies_depth.is_some(),
        input.options.dependencies.import_head_dependencies,
    );
    let progress_count = import.progress.len();
    let mut receipt = json!({"token":token,"requiresDependentsGraph":true,"progress":progress});
    if let Some(lane) = super::super::remote::active_lane(&input.root)? {
        receipt["currentLane"] = json!(format!("{}/{}", lane.scope, lane.name));
    }
    let count = targets.len();
    state.inbound = Some(super::super::Retained {
        token,
        receipt: receipt.clone(),
        import,
        workspace: None,
        applied: false,
        pending: Some(Pending { input: input.clone(), roots, targets, progress_count }),
        proofs: Vec::new(),
    });
    Ok((count, receipt))
}

pub(in crate::workspace::engine) fn complete(
    mut request: Complete,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let mut retained = state.inbound.take().ok_or_else(|| invalid("inbound graph owner absent"))?;
    let token = request.token.trim().to_owned();
    if token.is_empty() || retained.token != token {
        return Err(invalid("inbound graph token"));
    }
    let pending = retained.pending.take().ok_or_else(|| invalid("inbound graph phase"))?;
    let (targets, graph_progress, writes) =
        selected_targets(&pending, &mut retained, &mut request.graph)?;
    let mut fetch = pending.input.clone();
    fetch.options.dependencies.import_dependencies = false;
    fetch.options.dependencies.import_head_dependencies = false;
    fetch.options.dependencies.dependencies_depth = None;
    let (_, imported) = super::super::prepare_targets(&fetch, &targets)?;
    let mut result =
        super::super::finish(&pending.input, &pending.roots, &targets, imported, state, token)?;
    let retained =
        state.inbound.as_mut().ok_or_else(|| invalid("inbound graph retained absent"))?;
    retained.proofs = request.graph.read_set;
    result.1["graphProgress"] = json!(graph_progress);
    result.1["ownedWorkspaceWrites"] = json!(super::super::owned_writes::combine(writes)?);
    retained.receipt = result.1.clone();
    Ok(result)
}

fn overlay(rows: &[Value], graph: &mut HashMap<String, Vec<Target>>) -> io::Result<Vec<String>> {
    let mut sources = Vec::new();
    if rows.len() > 4096 {
        return Err(invalid("inbound graph workspace limit"));
    }
    for row in rows {
        let identity = row["componentIdentity"]
            .as_str()
            .map(str::trim)
            .filter(|identity| !identity.is_empty())
            .ok_or_else(|| invalid("inbound graph current identity"))?;
        sources.push(identity.to_owned());
        let dependencies = current_dependencies(row)?;
        graph.insert(identity.into(), dependencies);
    }
    Ok(sources)
}

fn selected_targets(
    pending: &Pending,
    retained: &mut super::super::Retained,
    graph: &mut Graph,
) -> io::Result<(Vec<Target>, Vec<Value>, Vec<Value>)> {
    retained.import.validate()?;
    proof::verify(&graph.read_set)?;
    let sources = super::super::bitmap_targets(&pending.input.root)?;
    let missing = retained.import.missing_graph_versions(&sources)?;
    let virtual_remotes = super::super::remote::objects(&pending.input, &missing)?;
    retained.import.prepare_graph_versions(&pending.input.root, &sources, &virtual_remotes)?;
    let graph_progress = super::super::progress::rows(&retained.import, &[], false, false)
        .into_iter()
        .skip(pending.progress_count)
        .collect::<Vec<_>>();
    let (published, writes) = retained.import.commit_with_receipts()?;
    for retained in graph.read_set.iter_mut().filter(|retained| retained.is_content()) {
        proof::accept_published(std::slice::from_mut(retained), &published);
    }
    proof::verify(&graph.read_set)?;
    let (mut adjacency, _) =
        super::dependencies::graph(&pending.input, &sources, &retained.import)?;
    let starts = overlay(&graph.rows, &mut adjacency)?;
    let mut targets = pending.targets.clone();
    targets.extend(super::select(
        &adjacency,
        &starts,
        &targets,
        &pending.input.options.dependencies.dependents.via,
    )?);
    Ok((targets, graph_progress, writes))
}

fn current_target(value: &Value) -> io::Result<Target> {
    if let Some(raw) = value
        .as_str()
        .or_else(|| value["id"].as_str())
    {
        return inline_target(raw);
    }
    let id = value
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(value);
    let scope = id["scope"]
        .as_str()
        .or_else(|| value["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("inbound graph dependency scope"))?;
    let raw_name = id["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("inbound graph dependency name"))?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| {
            (bare.trim(), Some(ver.trim()).filter(|ver| !ver.is_empty()))
        });
    let mut target = super::super::requested_target(&format!("{scope}/{name}"))?;
    id["version"]
        .as_str()
        .or_else(|| value["version"].as_str())
        .or_else(|| value["head"].as_str())
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .or(inline_ver)
        .unwrap_or_default()
        .clone_into(&mut target.version);
    Ok(target)
}

fn inline_target(raw: &str) -> io::Result<Target> {
    let mut target = super::super::requested_target(raw)?;
    if !raw.contains('@') {
        target.version.clear();
    }
    Ok(target)
}

fn current_dependencies(row: &Value) -> io::Result<Vec<Target>> {
    if let Some(resolved) = row.get("resolvedDependencies") {
        return resolved
            .as_array()
            .filter(|rows| rows.len() <= 16384)
            .ok_or_else(|| invalid("inbound resolved graph dependencies"))?
            .iter()
            .map(|dependency| current_target(&dependency["componentId"]))
            .collect();
    }
    let mut dependencies = Vec::new();
    for field in ["dependencies", "devDependencies"] {
        for dependency in row["current"][field]
            .as_array()
            .into_iter()
            .flatten()
        {
            dependencies.push(current_target(dependency)?);
        }
    }
    for id in row["peerDependencies"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let id = id.as_str().ok_or_else(|| invalid("inbound peer graph identity"))?;
        let mut target = super::super::requested_target(id)?;
        if !id.contains('@') {
            target.version.clear();
        }
        dependencies.push(target);
    }
    Ok(dependencies)
}
