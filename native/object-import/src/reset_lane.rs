//! Reset graph-selected local lane snapshots without changing workspace sources.

pub(crate) mod bitmap;
pub(crate) mod controls;

pub use batch::Batch;
pub use diagnostics::{apply_error_prefix, diagnostic};

mod batch;
mod dependents;
mod diagnostics;
#[cfg(test)]
mod graph_tests;
mod history;
mod membership;
mod model;
mod new_model;
mod object_deletion;
#[cfg(test)]
mod prefix_tests;
mod proofs;
mod remote;
mod repository;
mod selection;
mod state;
#[cfg(test)]
mod tests;

use bitmap::bitmap_key;
use history::{lane_history, pending_histories, version_history};
use new_model::remove_new_model;

use selection::select;

use crate::workspace::engine::command::outbound;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Clone, PartialEq)]
struct ObjectChange {
    hash: String,
    before: Vec<u8>,
    after: Option<Vec<u8>>,
}

#[derive(PartialEq)]
struct BytesChange {
    before: Vec<u8>,
    after: Vec<u8>,
}

struct BitmapChange {
    before: Vec<u8>,
    after: Vec<u8>,
    version: String,
}

/// A fully prepared explicit lane reset. Unsupported graph and lane states
/// decline before any object or bitmap changes.
pub struct Plan {
    root: PathBuf,
    identity: String,
    head_only: bool,
    force: bool,
    objects: Vec<ObjectChange>,
    bitmap: BitmapChange,
    index: Option<BytesChange>,
    selection: Selection,
}

struct BitmapState {
    before: Vec<u8>,
    document: Value,
    key: String,
    lane_scope: String,
    lane_name: String,
    exported: bool,
    staged_config: Option<Value>,
    restored: bool,
}

struct Repository {
    objects: PathBuf,
    lane_scope: String,
    lane_name: String,
    lane_hash: String,
    lane: Value,
    heads: Heads,
    model: Value,
    reads: proofs::ReadSet,
}

struct Heads {
    current: String,
    remote: Option<String>,
    baseline: Option<String>,
}

#[derive(Clone, PartialEq)]
struct Selection {
    removed: Vec<String>,
    next: Option<String>,
    labels: Vec<String>,
    keep_lane: bool,
    controls: Vec<controls::Control>,
    proofs: proofs::ReadSet,
    population: Vec<ObjectChange>,
}

impl Selection {
    fn new(removed: Vec<String>, next: Option<String>, head_only: bool) -> Self {
        let mut labels = removed.clone();
        if !head_only {
            labels.reverse();
        }
        Self {
            removed,
            keep_lane: next.is_some(),
            next,
            labels,
            controls: Vec::new(),
            proofs: Vec::new(),
            population: Vec::new(),
        }
    }
}

impl Plan {
    pub fn prepare(root: &Path, identity: &str, head_only: bool, force: bool) -> io::Result<Self> {
        let (scope, name) = identity
            .split_once('/')
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("lane reset identity"))?;
        let mut bitmap = BitmapState::load(root, scope, name)?;
        let mut repository = Repository::load(root, &bitmap, scope, name)?;
        bitmap.validate_head(&repository.model, &repository.heads.current)?;
        let selection = prepare_selection(root, identity, &bitmap, &repository, head_only, force)?;
        let mut objects = project_objects(&mut repository, identity, &selection)?;
        let bitmap_version = bitmap.project(&repository.model, selection.next.clone())?;
        let bitmap_after = bitmap.after()?;
        let bitmap =
            BitmapChange { before: bitmap.before, after: bitmap_after, version: bitmap_version };
        let index = projected_index(root, scope, name, &repository, &selection, &mut objects)?;
        Ok(Self {
            root: root.to_owned(),
            identity: identity.to_owned(),
            head_only,
            force,
            objects,
            bitmap,
            index,
            selection,
        })
    }

    /// Version labels in the order printed by `bit reset`.
    #[must_use]
    pub fn labels(&self) -> &[String] {
        &self.selection.labels
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        crate::reset_main::validate_file_id(file_id)?;
        let fresh = Self::prepare(&self.root, &self.identity, self.head_only, self.force)?;
        if self.objects != fresh.objects
            || self.bitmap.before != fresh.bitmap.before
            || self.bitmap.after != fresh.bitmap.after
            || self.index != fresh.index
            || self.selection != fresh.selection
        {
            return Err(invalid("lane reset changed during preparation"));
        }
        write_objects(&self.root, &self.objects)?;
        if let Some(index) = &self.index {
            fs::write(crate::scope_path(&self.root).join("index.json"), &index.after)?;
        }
        controls::publish(&self.selection.controls)?;
        crate::reset_main::backup_bitmap(&self.root, file_id)?;
        fs::write(self.root.join(".bitmap"), &self.bitmap.after)
    }
}

fn project_objects(
    repository: &mut Repository,
    identity: &str,
    selection: &Selection,
) -> io::Result<Vec<ObjectChange>> {
    let mut history = version_history(repository, identity)?;
    if let Some(last) = history::populations(repository)?.last() {
        history.after.clone_from(&last.after);
    }
    let lane_history = lane_history(repository, &selection.removed)?;
    let pending = pending_histories(
        &repository.objects,
        &repository.lane,
        &HashSet::from([identity.to_owned()]),
    )?;
    repository.project_lane(selection)?;
    let mut objects = vec![history, lane_history, repository.lane_object()?];
    objects.extend(pending);
    let population = history::populations(repository)?;
    let retained = selection.proofs.clone();
    if let Some(change) = model::project(repository, selection)
        .map_err(|error| {
            diagnostics::with_population(error, &repository.objects, population, retained)
        })?
    {
        objects.push(change);
    }
    Ok(objects)
}

fn changed(objects: &Path, hash: &str, kind: &str, value: &Value) -> io::Result<ObjectChange> {
    Ok(ObjectChange {
        hash: hash.to_owned(),
        before: fs::read(object_path(objects, hash))?,
        after: Some(outbound::encode_object(hash, kind, value)?),
    })
}

fn indexed_hash(index: &Value, section: &str, scope: &str, name: &str) -> io::Result<String> {
    let rows = if let Some(arr) = index.as_array() {
        if section == "components" { arr.as_slice() } else { &[][..] }
    } else {
        index[section].as_array().ok_or_else(|| invalid("lane reset index section"))?
    };
    let row = &rows[unique_position(rows, scope, name)?];
    let hash = row["hash"].as_str().ok_or_else(|| invalid("lane reset index hash"))?;
    crate::merge_history::hash(hash)?;
    Ok(hash.to_owned())
}

fn unique_position(rows: &[Value], scope: &str, name: &str) -> io::Result<usize> {
    let mut positions = rows
        .iter()
        .enumerate()
        .filter_map(|(index, row)| {
            let row_scope = row["id"]["scope"].as_str().unwrap_or_default();
            (row["isSymlink"] != true
                && (row_scope == scope || row_scope.is_empty())
                && row["id"]["name"] == name)
                .then_some(index)
        });
    let position = positions.next().ok_or_else(|| invalid("lane reset indexed identity absent"))?;
    if positions.next().is_some() {
        return Err(invalid("lane reset ambiguous index identity"));
    }
    Ok(position)
}

fn object_hash(id: &str) -> String {
    format!("{:x}", Sha1::digest(id.as_bytes()))
}

fn object_path(objects: &Path, hash: &str) -> PathBuf {
    objects
        .join(&hash[..2])
        .join(&hash[2..])
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn prepare_selection(
    root: &Path,
    identity: &str,
    bitmap: &BitmapState,
    repository: &Repository,
    head_only: bool,
    force: bool,
) -> io::Result<Selection> {
    let population = history::populations(repository)?;
    let retained = proofs::capture(repository)?;
    let mut selected = prepare_selected(root, identity, bitmap, repository, head_only, force)
        .map_err(|error| {
            diagnostics::with_population(error, &repository.objects, population.clone(), retained)
        })?;
    selected.population = population;
    Ok(selected)
}

fn prepare_selected(
    root: &Path,
    identity: &str,
    bitmap: &BitmapState,
    repository: &Repository,
    head_only: bool,
    force: bool,
) -> io::Result<Selection> {
    let mut selection = select(repository, head_only)?;
    selection.controls = controls::prepare(root, &[identity.to_owned()])?;
    selection.proofs = proofs::capture(repository)?;
    selection::validate_replacement(
        repository,
        &selection,
        !bitmap.exported && bitmap.component_is_exported(&repository.model),
    )?;
    if !force {
        dependents::validate(root, identity, &selection.removed, &mut selection.proofs)
            .map_err(|error| diagnostics::with_reads(error, selection.proofs.clone()))?;
    }
    Ok(selection)
}

fn projected_index(
    root: &Path,
    scope: &str,
    name: &str,
    repository: &Repository,
    selection: &Selection,
    objects: &mut Vec<ObjectChange>,
) -> io::Result<Option<BytesChange>> {
    let index = if selection.next.is_none()
        && repository.model["versions"].as_object().is_some_and(serde_json::Map::is_empty)
        && repository.model["orphanedVersions"].as_object().is_none_or(serde_json::Map::is_empty)
        && !repository.model["head"].is_string()
    {
        let (removed, index) = remove_new_model(root, scope, name)?;
        objects.retain(|object| object.hash != removed.hash);
        objects.push(removed);
        Some(index)
    } else {
        None
    };
    Ok(index)
}

fn write_objects(root: &Path, objects: &[ObjectChange]) -> io::Result<()> {
    for object in objects {
        let path = object_path(&crate::scope_path(root).join("objects"), &object.hash);
        if let Some(after) = &object.after {
            fs::create_dir_all(path.parent().ok_or_else(|| invalid("lane reset object path"))?)?;
            fs::write(path, after)?;
        } else {
            object_deletion::remove(&path)?;
        }
    }
    Ok(())
}
