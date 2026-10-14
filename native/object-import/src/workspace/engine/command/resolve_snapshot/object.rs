use super::{Material, graph, invalid, reconciliation, references, snapshot, sources};
use crate::workspace::{engine::dependency_graph::proof, snapshots};
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::Path};

pub(super) struct Context<'a> {
    pub root: &'a Path,
    pub receipt: &'a Value,
    pub lane: Option<&'a Value>,
    pub hashes: &'a HashMap<&'a str, &'a str>,
    pub snapshots: &'a snapshots::State,
}

pub(super) fn prepare(
    context: &Context<'_>,
    material: &Material,
    objects: &mut Vec<Value>,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Value> {
    let hash = context.hashes[material.identity.as_str()];
    let mut version = metadata(material, context.receipt, context.lane, context.hashes)?;
    let allocation = context.receipt["versions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["identity"] == material.identity)
        .ok_or_else(|| invalid("resolve allocation absent"))?;
    reconciliation::reconcile(&mut version, material, allocation)?;
    sources::sources(&mut version, material, context.snapshots, objects)?;
    graph::graph(context.root, &mut version, material, hash, context.hashes, objects, proofs)?;
    let model = if context.lane.is_some() || material.hidden {
        material.model.clone()
    } else {
        snapshot::local_model(&material.model, hash)?
    };
    objects.push(snapshot::object("Version", Some(hash), version.clone())?);
    objects.push(snapshot::object("Component", None, model.clone())?);
    Ok(json!({"identity":material.identity,"hash":hash,"version":version,"model":model,
        "selected":material.selected,"hidden":material.hidden}))
}

fn metadata(
    material: &Material,
    receipt: &Value,
    lane: Option<&Value>,
    hashes: &HashMap<&str, &str>,
) -> io::Result<Value> {
    let mut version = crate::workspace::engine::status_models::harmony::project(&material.version)?;
    version["schema"] = json!("2.0.0");
    references::rewrite_batch_refs(&mut version, hashes)?;
    version["log"] = receipt["log"].clone();
    if !material.selected {
        auto_message(&mut version);
    }
    version["batchId"] = receipt["batchId"].clone();
    version["bitVersion"] = receipt["bitVersion"].clone();
    version["buildStatus"] = json!("pending");
    version["modified"] = json!([]);
    version["parents"] = if material.current_head.is_empty() {
        json!([])
    } else {
        crate::merge_history::hash(&material.current_head)?;
        json!([material.current_head])
    };
    let fields = version.as_object_mut().ok_or_else(|| invalid("resolve Version"))?;
    fields.remove("squashed");
    fields.remove("unrelated");
    empty_builder(&mut version)?;
    origin(&mut version, material, lane)?;
    Ok(version)
}

fn auto_message(version: &mut Value) {
    let message = version["log"]["message"].as_str().unwrap_or_default();
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
        if extension["name"] == "teambit.pipelines/builder" {
            extension["data"] = json!({});
        }
    }
    Ok(())
}

fn origin(version: &mut Value, material: &Material, lane: Option<&Value>) -> io::Result<()> {
    let (scope, name) =
        material.identity.split_once('/').ok_or_else(|| invalid("resolve identity"))?;
    version["origin"] = json!({"id":{"scope":scope,"name":name}});
    if let Some(lane) = lane {
        version["origin"]["lane"] = lane["id"].clone();
        version["origin"]["lane"]["hash"] = lane["hash"].clone();
    }
    Ok(())
}
