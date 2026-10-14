mod metadata;
mod sources;
use super::{Prepared, invalid};
use crate::workspace::engine::dependency_graph::proof;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(in crate::workspace::engine::command) const PENDING_GRAPH_VERSION: &str =
    "__bit_pending_snapshot__";

pub(in crate::workspace::engine::command) struct Input<'a> {
    pub identity: &'a str,
    pub model: &'a Value,
    pub material: &'a Prepared,
    pub remote: &'a str,
    pub lane: Option<&'a Value>,
}
pub(in crate::workspace::engine::command) struct Snapshot {
    state: crate::snapshot_transaction::State,
    token: Value,
    proofs: Vec<proof::Proof>,
    pub versions: Vec<Value>,
}

pub(in crate::workspace::engine::command) fn validate_application_files(
    files: &[Value],
) -> io::Result<()> {
    metadata::no_application_files(files)
}

pub(in crate::workspace::engine::command) fn local_model(
    input: &Value,
    head: &str,
) -> io::Result<Value> {
    metadata::model(input, head)
}

pub(in crate::workspace::engine::command) fn prepare_models(
    staging: &Path,
    models: Vec<Value>,
) -> io::Result<Snapshot> {
    let objects = models
        .into_iter()
        .map(|model| metadata::object("Component", None, model))
        .collect::<io::Result<Vec<_>>>()?;
    prepare_objects(staging, objects)
}

pub(in crate::workspace::engine::command) fn object(
    kind: &str,
    hash: Option<&str>,
    fields: Value,
) -> io::Result<Value> {
    metadata::object(kind, hash, fields)
}

pub(in crate::workspace::engine::command) fn prepare_objects(
    staging: &Path,
    objects: Vec<Value>,
) -> io::Result<Snapshot> {
    let objects = Value::Array(objects);
    let mut state = crate::snapshot_transaction::State::default();
    let result = crate::snapshot_transaction::apply(
        "snapshotSerialize",
        json!({"objects":objects,"stagingDirectory":staging}),
        &mut state,
    )?;
    Ok(Snapshot { state, token: result["token"].clone(), proofs: Vec::new(), versions: Vec::new() })
}

pub(in crate::workspace::engine::command) fn prepare(
    root: &Path,
    staging: &Path,
    inputs: &[Input<'_>],
    receipt: &Value,
    message: &str,
) -> io::Result<Snapshot> {
    metadata::receipt(receipt, inputs)?;
    let budget = crate::read_budget::Budget::new(crate::workspace::snapshots::MAX_BYTES);
    let mut objects = Vec::new();
    let mut versions = Vec::new();
    let mut proofs = Vec::new();
    for (input, allocation) in inputs
        .iter()
        .zip(receipt["versions"].as_array().unwrap())
    {
        let hash = allocation["hash"].as_str().unwrap();
        let mut version = metadata::version(input, receipt, message)?;
        sources::prepare(root, input, hash, &mut version, &mut objects, &mut proofs, &budget)?;
        sources::dependencies_graph(allocation, &mut version, &mut objects)?;
        objects.push(metadata::object("Version", Some(hash), version.clone())?);
        objects.push(metadata::object("Component", None, metadata::snapshot_model(input, hash)?)?);
        versions.push(json!({"identity":input.identity,"hash":hash,"version":version}));
    }
    let mut seen = HashSet::new();
    objects.retain(|object| object["type"] != "Source" || seen.insert(object["hash"].clone()));
    let mut state = crate::snapshot_transaction::State::default();
    let result = crate::snapshot_transaction::apply(
        "snapshotSerialize",
        json!({"objects":objects,"stagingDirectory":staging}),
        &mut state,
    )?;
    Ok(Snapshot { state, token: result["token"].clone(), proofs, versions })
}
impl Snapshot {
    pub(in crate::workspace::engine::command) fn validate(&self) -> io::Result<()> {
        proof::verify(&self.proofs)
    }
    pub(in crate::workspace::engine::command) fn commit(&mut self, root: &Path) -> io::Result<()> {
        self.validate()?;
        let result = crate::snapshot_transaction::apply(
            "snapshotCommit",
            json!({"token":self.token,"objectsDirectory":root.join(".bit/objects")}),
            &mut self.state,
        )?;
        if result["failed"] != false || result["completed"] != result["count"] {
            return Err(io::Error::other("command snapshot persistence failed"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;

/// Reject unsupported graph/object projections before the caller allocates canonical UUIDs.
pub(in crate::workspace::engine::command) fn preflight(
    root: &Path,
    inputs: &[Input<'_>],
) -> io::Result<Vec<Value>> {
    let mut versions = Vec::new();
    let budget = crate::read_budget::Budget::new(crate::workspace::snapshots::MAX_BYTES);
    let mut objects = Vec::new();
    let mut proofs = Vec::new();
    let mut bytes = 0_usize;
    for input in inputs {
        metadata::independent(input, inputs)?;
        metadata::no_application_files(&input.material.files)?;
        let hash = preflight_head(input)?;
        crate::merge_history::hash(hash)?;
        let mut version = input.material.version.clone();
        let start = objects.len();
        sources::prepare(root, input, hash, &mut version, &mut objects, &mut proofs, &budget)?;
        bytes += objects[start..]
            .iter()
            .filter_map(|value| value["body"].as_str())
            .map(|value| value.len() / 2)
            .sum::<usize>();
        bytes += serialized_size("Version", Some(hash), version.clone())? + 4096;
        bytes += serialized_size("Component", None, metadata::snapshot_model(input, hash)?)?;
        versions.push(version);
        bytes += source_size(input)?;
        if bytes > 32 * 1024 * 1024 || objects.len() + inputs.len() * 2 > 4096 {
            return Err(invalid("snap preflight budget"));
        }
    }
    proof::verify(&proofs)?;
    Ok(versions)
}

fn preflight_head<'a>(input: &'a Input<'_>) -> io::Result<&'a str> {
    input.lane
        .and_then(|lane| lane["targets"].as_array())
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == input.identity)
        })
        .map_or(&input.model["head"], |target| &target["currentHead"])
        .as_str()
        .ok_or_else(|| invalid("snap preflight head"))
}

fn source_size(input: &Input<'_>) -> io::Result<usize> {
    input.material.files
        .iter()
        .map(|file| file["source"]["bytes"].as_u64().unwrap_or(u64::MAX))
        .try_fold(0_usize, |bytes, value| {
            bytes
                .checked_add(usize::try_from(value).map_err(io::Error::other)?)
                .ok_or_else(|| invalid("snap preflight size"))
        })
}

fn serialized_size(kind: &str, hash: Option<&str>, value: Value) -> io::Result<usize> {
    let fields: crate::js_json::Value =
        serde_json::from_value(metadata::object(kind, hash, value)?["fields"].clone())
            .map_err(io::Error::other)?;
    Ok(crate::snapshot_projection::serialize(kind, &fields, false)?.len())
}
