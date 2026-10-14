//! The ordinary (non-merge-command) snapshot produced by `merge --resolve`.
//! All allocations are supplied by the caller before any object is published.
pub(super) mod eligibility;
pub(super) use eligibility::preflight;
mod graph;
mod lane;
mod object;
mod reconciliation;
mod references;
mod sources;
use super::{invalid, merge::snapshot, repository::Repository};
use crate::workspace::{engine::dependency_graph::proof, snapshots};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};

pub(super) struct Material {
    pub identity: String,
    pub model: Value,
    pub version: Value,
    pub files: Vec<Value>,
    pub current_head: String,
    pub pending: Option<Value>,
    pub hidden: bool,
    pub selected: bool,
}

pub(super) struct Snapshot {
    objects: snapshot::Snapshot,
    proofs: Vec<proof::Proof>,
    repository: Option<Repository>,
    pub versions: Vec<Value>,
}

impl Snapshot {
    pub fn validate(&self) -> io::Result<()> {
        proof::verify(&self.proofs)?;
        if let Some(repository) = &self.repository {
            repository.validate()?;
        }
        self.objects.validate()
    }
    pub fn commit(&mut self, root: &Path) -> io::Result<()> {
        self.validate()?;
        self.objects.commit(root)
    }
}

pub(super) fn prepare(
    root: &Path,
    staging: &Path,
    materials: &[Material],
    lane: Option<&Value>,
    receipt: &Value,
    snapshots: &snapshots::State,
) -> io::Result<Snapshot> {
    preflight(root, materials, snapshots)?;
    let hashes = allocations(materials, receipt)?;
    let mut objects = Vec::new();
    let mut versions = Vec::new();
    let mut proofs = Vec::new();
    let context = object::Context { root, receipt, lane, hashes: &hashes, snapshots };
    for material in materials {
        versions.push(object::prepare(&context, material, &mut objects, &mut proofs)?);
    }
    let mut seen = HashSet::new();
    let repository = if let Some(lane) = lane {
        let mut repository = Repository::new(root, None);
        lane::lane_objects(lane, materials, receipt, &mut objects, &mut repository)?;
        Some(repository)
    } else {
        None
    };
    objects.retain(|object| object["type"] != "Source" || seen.insert(object["hash"].clone()));
    Ok(Snapshot {
        objects: snapshot::prepare_objects(staging, objects)?,
        proofs,
        repository,
        versions,
    })
}

fn allocations<'a>(
    materials: &'a [Material],
    receipt: &'a Value,
) -> io::Result<HashMap<&'a str, &'a str>> {
    let rows = receipt["versions"].as_array().ok_or_else(|| invalid("resolve allocations"))?;
    if rows.len() != materials.len() || materials.len() > 4096 {
        return Err(invalid("resolve allocation count"));
    }
    validate_scalars(receipt)?;
    let mut hashes = HashMap::new();
    let mut unique_hashes = HashSet::new();
    for (material, row) in materials.iter().zip(rows) {
        if row["identity"] != material.identity {
            return Err(invalid("resolve allocation identity"));
        }
        let hash = row["hash"].as_str().ok_or_else(|| invalid("resolve allocation hash"))?;
        crate::merge_history::hash(hash)?;
        if !unique_hashes.insert(hash) {
            return Err(invalid("resolve duplicate hash allocation"));
        }
        if hashes.insert(material.identity.as_str(), hash).is_some() {
            return Err(invalid("resolve duplicate allocation"));
        }
    }
    Ok(hashes)
}

fn validate_scalars(receipt: &Value) -> io::Result<()> {
    if receipt["batchId"].as_str().is_none()
        || receipt["bitVersion"].as_str().is_none()
        || receipt["log"]["date"].as_str().is_none()
    {
        return Err(invalid("resolve scalar receipt"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
