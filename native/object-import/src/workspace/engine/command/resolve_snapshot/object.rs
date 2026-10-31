use super::{Material, graph, invalid, reconciliation, references, snapshot, sources};
use crate::workspace::{engine::dependency_graph::proof, snapshots};
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::Path};

pub(super) struct Context<'a> {
    pub root: &'a Path,
    pub receipt: &'a Value,
    pub lane: Option<&'a Value>,
    pub versions: &'a HashMap<&'a str, &'a str>,
    pub hashes: &'a HashMap<&'a str, &'a str>,
    pub snapshots: &'a snapshots::State,
    pub ordinary_snapshot: bool,
}

pub(super) fn prepare(
    context: &Context<'_>,
    material: &Material,
    objects: &mut Vec<Value>,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Value> {
    let hash = context.hashes[material.identity.as_str()];
    let allocation = context.receipt["versions"]
        .as_array()
        .ok_or_else(|| invalid("resolve versions array"))?
        .iter()
        .find(|row| row["identity"] == material.identity)
        .ok_or_else(|| invalid("resolve allocation absent"))?;
    let mut version = metadata(material, context.receipt, context.lane, context.versions)?;
    component_message(&mut version, allocation, material.participation.automatic)?;
    super::build::metadata(&mut version, allocation)?;
    reconciliation::reconcile(&mut version, material, allocation)?;
    sources::sources(
        &mut version,
        material,
        context.snapshots,
        objects,
        context.ordinary_snapshot,
    )?;
    snapshot::dependencies_graph(allocation, &mut version, objects)?;
    graph::graph(
        context.root,
        &mut version,
        material,
        context.versions[material.identity.as_str()],
        context.versions,
        objects,
        proofs,
    )?;
    let model = if context.lane.is_some() || material.hidden {
        material.model.clone()
    } else {
        local_model(material, hash)?
    };
    objects.push(snapshot::object("Version", Some(hash), version.clone())?);
    objects.push(snapshot::object("Component", None, model.clone())?);
    Ok(json!({"identity":material.identity,"hash":hash,"version":version,"model":model,
        "componentVersion":context.versions[material.identity.as_str()],"selected":material.participation.selected,"hidden":material.hidden}))
}

fn metadata(
    material: &Material,
    receipt: &Value,
    lane: Option<&Value>,
    hashes: &HashMap<&str, &str>,
) -> io::Result<Value> {
    let pinned = super::pinned_dependencies(&material.version);
    let mut version = crate::workspace::engine::status_models::harmony::project(&material.version)?;
    version["schema"] = json!("2.0.0");
    references::rewrite_batch_refs(&mut version, hashes, &pinned)?;
    version["log"] = receipt["log"].clone();
    version["batchId"] = receipt["batchId"].clone();
    version["bitVersion"] = receipt["bitVersion"].clone();
    version["buildStatus"] = json!(if super::is_removed(&version) { "skipped" } else { "pending" });
    version["modified"] = json!([]);
    version["parents"] = if material.version_state.current_head.is_empty() {
        json!([])
    } else {
        crate::merge_history::hash(&material.version_state.current_head)?;
        json!([material.version_state.current_head])
    };
    let fields = version.as_object_mut().ok_or_else(|| invalid("resolve Version"))?;
    fields.remove("squashed");
    fields.remove("unrelated");
    fields.remove("pinnedDependencies");
    // The graph is the snap's own, from the lockfile (`dependenciesGraph`).
    fields.remove("dependenciesGraphRef");
    empty_builder(&mut version)?;
    origin(&mut version, material, lane)?;
    Ok(version)
}

fn auto_message(version: &mut Value) {
    let message = version["log"]["message"].as_str().map_or("", str::trim);
    version["log"]["message"] = if message.is_empty() {
        json!("bump dependencies versions")
    } else {
        json!(format!("{message} (bump dependencies versions)"))
    };
}

fn empty_builder(version: &mut Value) -> io::Result<()> {
    let extensions =
        version["extensions"].as_array_mut().ok_or_else(|| invalid("resolve extensions"))?;
    for extension in extensions {
        if crate::workspace::engine::client_status::config::is_extension_aspect(
            extension,
            "teambit.pipelines/builder",
        ) {
            extension["data"] = json!({});
        }
    }
    Ok(())
}

fn origin(version: &mut Value, material: &Material, lane: Option<&Value>) -> io::Result<()> {
    let (scope, name) = material.identity
        .trim()
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| invalid("resolve identity"))?;
    version["origin"] = json!({"id":{"scope":scope,"name":name}});
    if let Some(lane) = lane {
        if let Some((lane_scope, lane_name)) = lane["id"]
            .as_str()
            .and_then(|raw| raw.trim().split_once('/'))
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        {
            version["origin"]["lane"] =
                json!({"scope": lane_scope, "name": lane_name, "hash": lane["hash"]});
        } else {
            version["origin"]["lane"] = lane["id"].clone();
            version["origin"]["lane"]["hash"] = lane["hash"].clone();
        }
    }
    Ok(())
}

pub(super) fn local_model(material: &Material, hash: &str) -> io::Result<Value> {
    let Some(tag) = &material.version_state.tagged_version else {
        return snapshot::local_model(&material.model, hash);
    };
    let tag = tag.trim();
    let mut model = material.model.clone();
    let tags = model["versions"].as_object_mut().ok_or_else(|| invalid("tag model versions"))?;
    if tag.is_empty() || tags.contains_key(tag) {
        return Err(invalid("tag version already exists"));
    }
    tags.insert(tag.to_owned(), json!(hash));
    if let Some(orphaned) = model.get_mut("orphanedVersions") {
        orphaned
            .as_object_mut()
            .ok_or_else(|| invalid("tag orphaned versions"))?
            .remove(tag);
    }
    model["head"] = json!(hash);
    if model["state"]["versions"].is_null() {
        model["state"] = json!({"versions":{}});
    }
    let versions =
        model["state"]["versions"].as_object_mut().ok_or_else(|| invalid("tag local versions"))?;
    let row = versions
        .entry(tag.to_owned())
        .or_insert_with(|| json!({}));
    row.as_object_mut()
        .ok_or_else(|| invalid("tag local version"))?
        .insert("local".into(), json!(true));
    Ok(model)
}

fn component_message(version: &mut Value, allocation: &Value, automatic: bool) -> io::Result<()> {
    if let Some(log) = allocation.get("log") {
        component_log(version, log)?;
    }
    if automatic && allocation["logResolved"] != true {
        auto_message(version);
    }
    Ok(())
}

fn component_log(version: &mut Value, log: &Value) -> io::Result<()> {
    for field in ["message", "username", "email"] {
        if let Some(value) = log.get(field) {
            version["log"][field] = json!(
                value
                    .as_str()
                    .map(str::trim)
                    .ok_or_else(|| invalid("snapshot component log field"))?
            );
        }
    }
    Ok(())
}
