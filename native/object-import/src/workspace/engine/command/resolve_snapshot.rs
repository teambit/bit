//! The ordinary (non-merge-command) snapshot produced by `merge --resolve`.
//! All allocations are supplied by the caller before any object is published.
pub(super) mod eligibility;
pub(super) mod sources;
pub(super) use eligibility::preflight;
mod build;
mod graph;
mod history;
mod lane;
mod object;
mod reconciliation;
mod references;
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
    pub version_state: VersionState,
    pub pending: Option<Value>,
    pub hidden: bool,
    pub participation: Participation,
}

pub(super) fn is_removed(version: &Value) -> bool {
    version["extensions"]
        .as_array()
        .is_some_and(|entries| {
            entries
                .iter()
                .any(|entry| {
                    crate::workspace::engine::client_status::config::is_extension_aspect(
                        entry,
                        "teambit.component/remove",
                    ) && entry["config"]["removed"] == true
                })
        })
}

pub(super) fn pinned_dependencies(version: &Value) -> HashSet<String> {
    version["pinnedDependencies"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|dep| !dep.is_empty())
        .map(str::to_owned)
        .collect()
}

/// The previous object ref and the semantic alias planned for its successor.
pub(super) struct VersionState {
    pub current_head: String,
    pub tagged_version: Option<String>,
}

#[derive(Clone, Copy)]
pub(super) struct Participation {
    pub selected: bool,
    pub automatic: bool,
}

pub(super) struct Snapshot {
    objects: snapshot::Snapshot,
    proofs: Vec<proof::Proof>,
    repository: Option<Repository>,
    pub versions: Vec<Value>,
}

impl Snapshot {
    pub(super) fn accept_published(
        &mut self,
        files: &HashMap<std::path::PathBuf, Vec<u8>>,
    ) -> io::Result<()> {
        proof::accept_published(&mut self.proofs, files);
        if let Some(repository) = &mut self.repository {
            repository.accept_published(files)?;
        }
        self.validate()
    }
    pub(super) fn published_files(
        &self,
        root: &Path,
    ) -> io::Result<HashMap<std::path::PathBuf, Vec<u8>>> {
        let mut files = HashMap::new();
        for object in self.staged_objects() {
            let hash = object["hash"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("snapshot staged object hash"))?;
            crate::merge_history::hash(hash)?;
            let expected = std::fs::read(
                object["compressedPath"]
                    .as_str()
                    .map(str::trim)
                    .filter(|path| !path.is_empty())
                    .ok_or_else(|| invalid("snapshot staged object path"))?,
            )?;
            let path = crate::scope_path(root)
                .join("objects")
                .join(&hash[..2])
                .join(&hash[2..]);
            if std::fs::read(&path)? != expected {
                return Err(invalid("snapshot published object changed"));
            }
            files.insert(path, expected);
        }
        Ok(files)
    }

    pub fn staged_objects(&self) -> &[Value] {
        &self.objects.staged_objects
    }
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
    ordinary_snapshot: bool,
) -> io::Result<Snapshot> {
    preflight(root, materials, snapshots, ordinary_snapshot)?;
    let hashes = allocations(materials, receipt)?;
    let versions_by_id = publication_versions(materials, &hashes, lane)?;
    let mut objects = Vec::new();
    let mut versions = Vec::new();
    let mut proofs = Vec::new();
    let mut receipt = receipt.clone();
    build::artifacts(&mut receipt, &mut objects, &mut proofs)?;
    let context = object::Context {
        root,
        receipt: &receipt,
        lane,
        hashes: &hashes,
        versions: &versions_by_id,
        snapshots,
        ordinary_snapshot,
    };
    for material in materials {
        versions.push(object::prepare(&context, material, &mut objects, &mut proofs)?);
    }
    let mut seen = HashSet::new();
    let repository = history_repository(root, materials, lane, &receipt, &mut objects)?;
    objects.retain(|object| object["type"] != "Source" || seen.insert(object["hash"].clone()));
    Ok(Snapshot {
        objects: snapshot::prepare_objects(staging, objects)?,
        proofs,
        repository,
        versions,
    })
}

fn history_repository(
    root: &Path,
    materials: &[Material],
    lane: Option<&Value>,
    receipt: &Value,
    objects: &mut Vec<Value>,
) -> io::Result<Option<Repository>> {
    if lane.is_some()
        || materials.iter().any(|material| material.version_state.tagged_version.is_some())
    {
        let mut repository = Repository::new(root, None);
        if let Some(lane) = lane {
            lane::lane_objects(lane, materials, receipt, objects, &mut repository)?;
        } else {
            history::tag_histories(root, materials, objects, &mut repository)?;
        }
        Ok(Some(repository))
    } else {
        Ok(None)
    }
}

fn publication_versions<'a>(
    materials: &'a [Material],
    hashes: &HashMap<&'a str, &'a str>,
    lane: Option<&Value>,
) -> io::Result<HashMap<&'a str, &'a str>> {
    if lane.is_some()
        && materials.iter().any(|material| material.version_state.tagged_version.is_some())
    {
        return Err(invalid("tag is only supported on main"));
    }
    Ok(materials
        .iter()
        .map(|material| {
            (
                material.identity.as_str(),
                material.version_state.tagged_version
                    .as_deref()
                    .unwrap_or_else(|| hashes[material.identity.as_str()]),
            )
        })
        .collect())
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
    if receipt["batchId"]
        .as_str()
        .map(str::trim)
        .is_none_or(str::is_empty)
        || receipt["bitVersion"]
            .as_str()
            .map(str::trim)
            .is_none_or(str::is_empty)
        || receipt["log"]["date"]
            .as_str()
            .map(str::trim)
            .is_none_or(str::is_empty)
    {
        return Err(invalid("resolve scalar receipt"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod tag_tests;
