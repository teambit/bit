use super::{
    super::{capture, invalid, repository, resolve_snapshot::Material},
    Plan, Retained, cascade, graph, projection, selection,
};
use crate::workspace::{engine::status_models::versions, snapshots};
use serde_json::{Value, json};
use std::io;

pub(super) fn prepare(
    retained: &mut Retained,
    input: Plan,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    let selected = select(retained, &input)?;
    let cascaded = cascade::visible(&input.current, &selected, &input.semver)?;
    let mut order = selected.clone();
    order.extend(cascaded);
    let captured = capture::all(&retained.record.request.root, input.current, snapshots, pool)?;
    retained.record.proofs.extend(super::source_proofs::capture(&captured, snapshots)?);
    let mut materials = order
        .iter()
        .map(|identity| {
            material(retained, identity, selected.contains(identity), &captured, &input.components)
        })
        .collect::<io::Result<Vec<_>>>()?;
    super::hidden::append(retained, &mut materials, snapshots)?;
    order = materials
        .iter()
        .map(|material| material.identity.clone())
        .collect();
    preflight(retained, &mut materials, snapshots)?;
    retained.record.proofs.extend(input.dependency_read_set);
    retained.record.repository.validate()?;
    super::proof::verify(&retained.record.proofs)?;
    let result = json!({"resolvedComponents":selected.iter().map(|id| json!({"id":id})).collect::<Vec<_>>()});
    let output = json!({"token":retained.record.token,"selectedIds":selected,"needsSnap":order,"result":result,"issueTargets":materials.iter().map(|material| json!({"identity":format!("{}@{}",material.identity,material.current_head),"dependencies":material.version["dependencies"],"devDependencies":material.version["devDependencies"],"flattenedDependencies":material.version["flattenedDependencies"]})).collect::<Vec<_>>(),"scalarPreparation":{"laneHistory":!retained.record.context["lane"]["current"].is_null(),"squash":materials.iter().filter_map(|material| material.pending.as_ref().filter(|pending|pending["shouldSquash"]==true).map(|pending|json!({"identity":material.identity,"laneId":pending["laneId"]}))).collect::<Vec<_>>()},"progress":{"bitmapCount":retained.record.targets.len(),"imports":[],"loads":[retained.record.targets.len(),selected.len(),retained.record.targets.len(),retained.record.targets.len()]}});
    retained.selected = selected;
    retained.materials = materials;
    retained.result = result;
    Ok(output)
}

fn select(retained: &Retained, input: &Plan) -> io::Result<Vec<String>> {
    let targets = &retained.record.targets;
    if input.current.len() != targets.len() || input.components.len() != targets.len() {
        return Err(invalid("resolve capture count"));
    }
    for (current, target) in input.current.iter().zip(targets) {
        if current["identity"] != target["identity"]
            || current["version"] != target["version"]
            || current["directory"] != target["directory"]
        {
            return Err(invalid("resolve capture binding"));
        }
    }
    let selected = if retained.record.request.options.pattern.is_some() {
        selection::select(
            targets,
            &retained.pending,
            Some(input.selected_ids.as_deref().ok_or_else(|| invalid("resolve pattern receipt"))?),
        )?
    } else {
        if input.selected_ids.is_some() {
            return Err(invalid("resolve unexpected selection receipt"));
        }
        retained.selected.clone()
    };
    Ok(selected)
}

fn material(
    retained: &mut Retained,
    identity: &String,
    selected: bool,
    captured: &[capture::Captured],
    components: &[projection::Component],
) -> io::Result<Material> {
    let current = captured
        .iter()
        .find(|row| row.target.identity == *identity)
        .ok_or_else(|| invalid("resolve capture absent"))?;
    let receipt = components
        .iter()
        .find(|row| row.identity == *identity)
        .ok_or_else(|| invalid("resolve policy receipt absent"))?;
    let model = repository::model(&retained.record.context, identity)?
        .ok_or_else(|| invalid("resolve model absent"))?;
    let reference = versions::reference(&model, &current.target.version)?;
    let stored = retained.record.repository.read(&reference, "Version")?;
    let version =
        projection::version(&stored, &current.target.current, &current.metadata, receipt)?;
    let head = current_head(retained, identity, &model)?;
    if reference != head {
        return Err(invalid("resolve detached component"));
    }
    Ok(Material {
        identity: identity.clone(),
        model,
        version,
        files: current.files
            .as_array()
            .ok_or_else(|| invalid("resolve files"))?
            .clone(),
        current_head: head,
        pending: retained.pending
            .iter()
            .find(|row| selection::identity(&row["id"]).ok().as_ref() == Some(identity))
            .cloned(),
        hidden: false,
        selected,
    })
}

fn current_head(retained: &Retained, identity: &str, model: &Value) -> io::Result<String> {
    let head = retained.record.context["lane"]["targets"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == identity)
        })
        .and_then(|row| row["currentHead"].as_str())
        .or_else(|| model["head"].as_str())
        .ok_or_else(|| invalid("resolve current head"))?
        .to_owned();
    Ok(head)
}

fn preflight(
    retained: &mut Retained,
    materials: &mut [Material],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    graph::project(materials, &mut retained.record.repository)?;
    super::super::resolve_snapshot::preflight(&retained.record.request.root, materials, snapshots)?;
    super::super::resolve_publication::preflight(
        &retained.record.request.root,
        &retained.record.context,
        materials,
        &retained.pending,
        retained.record.context
            .get("lane")
            .and_then(|lane| lane.get("current")),
    )?;
    Ok(())
}
