use super::{
    super::{
        capture, invalid, repository,
        resolve_snapshot::{Material, Participation, VersionState},
    },
    Plan, Retained, Selection, cascade, graph, projection, selection,
};
use crate::workspace::{engine::status_models::versions, snapshots};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

pub(super) fn prepare(
    retained: &mut Retained,
    input: Plan,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    validate_capture(retained, &input)?;
    let captured = capture_for_snapshot(retained, input.current.clone(), snapshots, pool)?;
    let Selection { identities: selected, load_count } =
        select_current(retained, &captured, &input, snapshots)?;
    if selected.is_empty() {
        retain_proofs(retained, input.dependency_read_set)?;
        retained.finalized = super::publication::Phase::Noop;
        return Ok(
            json!({"token":retained.record.token,"noop":true,"needsSnap":[],"result":null,"progress":{"bitmapCount":retained.record.targets.len(),"imports":[],"loads":[retained.record.targets.len()],"snapFailed":true}}),
        );
    }
    let (mut materials, automatic, auto_loaded) =
        materials(retained, &selected, &captured, &input, snapshots)?;
    project_materials(retained, &input, &mut materials, snapshots)?;
    let issue_graph = super::issue_graph::capture(
        &input.components,
        &input.current,
        &materials,
        &mut retained.record.repository,
    )?;
    retain_proofs(retained, input.dependency_read_set)?;
    let mut result = report(retained, &input.semver, &selected, &materials, &automatic)?;
    super::root::report(retained, &materials, &mut result);
    let mut output = response(retained, &selected, &materials, &result, (auto_loaded, load_count));
    if retained.snap.is_none() && retained.tag.is_none() {
        output["autoSnapResults"] = json!(automatic);
    }
    output["issueGraph"] = issue_graph;
    snapshot_metadata(retained, &materials, &mut output);
    retained.finalized.callbacks_mut()?.paths = super::source_proofs::owned_paths(
        &retained.record.request.root,
        &input.current,
        &materials,
    );
    retained.selected = selected;
    retained.materials = materials;
    retained.result = result;
    Ok(output)
}

fn select_current(
    retained: &mut Retained,
    captured: &[capture::Captured],
    input: &Plan,
    snapshots: &snapshots::State,
) -> io::Result<Selection> {
    let Selection {
        identities: mut selected,
        mut load_count,
    } = selected(retained, captured, input)?;
    if super::root::include(retained, captured, &mut selected)? {
        load_count += 1;
    }
    retained.record.proofs.extend(super::source_proofs::capture(captured, snapshots)?);
    Ok(Selection { identities: selected, load_count })
}

fn snapshot_metadata(retained: &Retained, materials: &[Material], output: &mut Value) {
    if let Some(root) = super::root::added(retained) {
        output["autoAddedWorkspaceRoot"] = json!(root);
    }
    if retained.snap.as_ref().is_some_and(|options| options.policy.skip_published_versions) {
        output["tagRegistryVersions"] = json!(materials.iter().map(|material|json!({"identity":material.identity,"extensions":material.version["extensions"],"bindingPrefix":material.model["bindingPrefix"]})).collect::<Vec<_>>());
    }
}

fn report(
    retained: &Retained,
    semver: &Value,
    selected: &[String],
    materials: &[Material],
    automatic: &[Value],
) -> io::Result<Value> {
    if retained.tag.is_some() {
        super::tag::report(retained, semver, selected, materials, automatic)
    } else if retained.snap.is_some() {
        super::snap::report(retained, selected, materials, automatic)
    } else {
        Ok(
            json!({"resolvedComponents":selected.iter().map(|id| json!({"id":id})).collect::<Vec<_>>()}),
        )
    }
}

fn selected(
    retained: &mut Retained,
    captured: &[capture::Captured],
    input: &Plan,
) -> io::Result<Selection> {
    if retained.tag.is_some() {
        super::tag::select(retained, captured, input)
    } else if retained.snap.is_some() {
        super::snap::select(retained, captured, input.selected_ids.as_deref())
            .map(Selection::unique)
    } else {
        select(retained, input).map(Selection::unique)
    }
}

fn retain_proofs(retained: &mut Retained, proofs: Vec<super::proof::Proof>) -> io::Result<()> {
    retained.record.proofs.extend(proofs);
    retained.record.repository.validate()?;
    super::proof::verify(&retained.record.proofs)
}

fn materials(
    retained: &mut Retained,
    selected: &[String],
    captured: &[capture::Captured],
    input: &Plan,
    snapshots: &mut snapshots::State,
) -> io::Result<(Vec<Material>, Vec<Value>, bool)> {
    let seeds = auto_seeds(retained, selected, captured);
    let mut automatic = if seeds.is_empty() {
        Vec::new()
    } else {
        cascade::reports(&input.current, &seeds, &input.semver)?
    };
    let order = material_order(selected, &automatic);
    let mut components = input.components.clone();
    bind_new(retained, selected, captured, &mut components)?;
    let automatic_ids = automatic
        .iter()
        .filter_map(|row| row["id"].as_str())
        .collect::<HashSet<_>>();
    let mut materials = order
        .iter()
        .map(|identity| {
            material(
                retained,
                identity,
                Participation {
                    selected: selected.contains(identity),
                    automatic: automatic_ids.contains(identity.as_str()),
                },
                captured,
                &components,
            )
        })
        .collect::<io::Result<Vec<_>>>()?;
    if !retained.snap.as_ref().is_some_and(|options| options.skip_auto_snap) {
        super::hidden::append(retained, &mut materials, snapshots)?;
    }
    if retained.snap.is_some() {
        automatic.extend(super::snap::hidden_reports(&materials)?);
    }
    Ok((materials, automatic, !seeds.is_empty()))
}

fn material_order(selected: &[String], automatic: &[Value]) -> Vec<String> {
    let mut order = selected.to_vec();
    order.extend(
        automatic
            .iter()
            .map(|row| row["id"].as_str().unwrap().to_owned())
            .filter(|identity| !selected.contains(identity)),
    );
    order
}

fn auto_seeds(
    retained: &Retained,
    selected: &[String],
    captured: &[capture::Captured],
) -> Vec<String> {
    if retained.snap.as_ref().is_some_and(|options| options.skip_auto_snap) {
        return Vec::new();
    }
    selected
        .iter()
        .filter(|identity| {
            captured
                .iter()
                .any(|current| {
                    current.target.identity == **identity
                        && !current.target.version.is_empty()
                })
        })
        .cloned()
        .collect()
}

pub(super) fn bind_new(
    retained: &Retained,
    selected: &[String],
    captured: &[capture::Captured],
    components: &mut [projection::Component],
) -> io::Result<()> {
    if retained.snap.is_some() {
        let new_ids = captured
            .iter()
            .filter(|current| {
                current.target.version.is_empty() && selected.contains(&current.target.identity)
            })
            .map(|current| current.target.identity.clone())
            .collect();
        projection::bind_new_dependencies(components, &new_ids)?;
    }
    Ok(())
}

fn response(
    retained: &Retained,
    selected: &[String],
    materials: &[Material],
    result: &Value,
    loading: (bool, usize),
) -> Value {
    let order: Vec<_> = materials
        .iter()
        .map(|material| &material.identity)
        .collect();
    json!({"token":retained.record.token,"selectedIds":selected,"needsSnap":order,"result":result,"issueTargets":materials.iter().map(|material| json!({"identity":format!("{}@{}",material.identity,material.version_state.current_head),"dependencies":material.version["dependencies"],"devDependencies":material.version["devDependencies"],"flattenedDependencies":material.version["flattenedDependencies"]})).collect::<Vec<_>>(),"scalarPreparation":{"laneHistory":!retained.record.context["lane"]["current"].is_null(),"squash":materials.iter().filter_map(|material| material.pending.as_ref().filter(|pending|pending["shouldSquash"]==true).map(|pending|json!({"identity":material.identity,"laneId":pending["laneId"]}))).collect::<Vec<_>>()},"progress":progress(retained,loading.1,loading.0)})
}

fn progress(retained: &Retained, selected: usize, auto_loaded: bool) -> Value {
    let count = retained.record.targets.len();
    let mut loads = vec![count, selected, count, count];
    let mut output = json!({"bitmapCount":count,"imports":[]});
    if let Some(options) = &retained.snap {
        if !auto_loaded {
            loads.pop();
        }
        let persist = retained.tag.as_ref().is_some_and(|tag| tag.persist);
        // Tag loads the pending workspace set even with --unmerged; snap skips it.
        if !persist && !options.unmodified && (!options.unmerged || retained.tag.is_some()) {
            loads.insert(0, count);
        }
        output["graphImports"] = retained.record.repository.progress()["imports"].clone();
        output["skipDependenciesGraph"] = json!(options.policy.no_lock_deps);
    }
    output["loads"] = json!(loads);
    output
}

fn select(retained: &Retained, input: &Plan) -> io::Result<Vec<String>> {
    let targets = &retained.record.targets;
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

fn validate_capture(retained: &Retained, input: &Plan) -> io::Result<()> {
    validate_current(retained, &input.current, input.components.len())
}
pub(super) fn validate_current(
    retained: &Retained,
    current: &[Value],
    component_count: usize,
) -> io::Result<()> {
    let targets = &retained.record.targets;
    if current.len() != targets.len() || component_count != targets.len() {
        return Err(invalid("resolve capture count"));
    }
    for (current, target) in current.iter().zip(targets) {
        if current["identity"] != target["identity"]
            || current["version"] != target["version"]
            || current["directory"] != target["directory"]
        {
            return Err(invalid("resolve capture binding"));
        }
    }
    Ok(())
}

pub(super) fn material(
    retained: &mut Retained,
    identity: &String,
    participation: Participation,
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
    let model = repository::model(&retained.record.context, identity)?;
    if model.is_none() && retained.snap.is_some() && current.target.version.is_empty() {
        return super::snap::new_material(retained, current, receipt, participation);
    }
    let model = model.ok_or_else(|| invalid("resolve model absent"))?;
    let reference = versions::reference(&model, &current.target.version)?;
    let stored = retained.record.repository.read(&reference, "Version")?;
    let version =
        projection::version(&stored, &current.target.current, &current.metadata, receipt)?;
    let head = current_head(retained, identity, &model)?;
    if reference != head
        && !retained.snap.as_ref().is_some_and(|options| options.policy.ignore_newest_version)
    {
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
        version_state: VersionState { current_head: reference, tagged_version: None },
        pending: retained.pending
            .iter()
            .find(|row| selection::identity(&row["id"]).ok().as_ref() == Some(identity))
            .cloned(),
        hidden: false,
        participation,
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

pub(super) fn preflight(
    retained: &mut Retained,
    materials: &mut [Material],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    if retained.snap.as_ref().is_some_and(|options| options.policy.rebuild_deps_graph) {
        graph::rebuild(materials, &mut retained.record.repository)?;
    } else {
        graph::project(materials, &mut retained.record.repository)?;
    }
    super::super::resolve_snapshot::preflight(
        &retained.record.request.root,
        materials,
        snapshots,
        retained.snap.is_some(),
    )?;
    super::super::resolve_publication::preflight(
        &retained.record.request.root,
        &retained.record.context,
        materials,
        &retained.pending,
        retained.record.repository.imported_index(),
        retained.snap.is_some(),
    )?;
    Ok(())
}

fn project_materials(
    retained: &mut Retained,
    input: &Plan,
    materials: &mut [Material],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    if retained.snap.is_some() {
        super::snap::prepare_graph_imports(retained, materials)?;
    }
    if retained.tag.is_some() {
        super::tag::versions(retained, input, materials)?;
    }
    super::root::provenance(retained, materials)?;
    if !retained.tag.as_ref().is_some_and(|options| options.soft) {
        preflight(retained, materials, snapshots)?;
    }
    Ok(())
}

pub(super) fn capture_for_snapshot(
    retained: &Retained,
    current: Vec<Value>,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<capture::Captured>> {
    if retained.snap.is_some() {
        capture::all_for_snapshot(&retained.record.request.root, current, snapshots, pool)
    } else {
        capture::all(&retained.record.request.root, current, snapshots, pool)
    }
}
