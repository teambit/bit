//! Reset linear lane snapshots newer than the lane's recorded remote head.

pub use batch::Batch;

mod batch;
mod dependents;
mod history;
mod new_model;
mod remote;
#[cfg(test)]
mod tests;

use history::{lane_history, pending_histories, version_history};
use new_model::remove_new_model;
use remote::{exported_head, reached_boundary};

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
}

impl BitmapState {
    fn load(root: &Path, scope: &str, name: &str) -> io::Result<Self> {
        let before = fs::read(root.join(".bitmap"))?;
        let document = crate::recovery::jsonc::parse(&before)?;
        let rows = document.as_object().ok_or_else(|| invalid("lane reset bitmap"))?;
        let lane = &rows["_bit_lane"];
        let lane_scope = lane["id"]["scope"]
            .as_str()
            .ok_or_else(|| invalid("lane reset scope"))?
            .to_owned();
        let lane_name = lane["id"]["name"]
            .as_str()
            .ok_or_else(|| invalid("lane reset name"))?
            .to_owned();
        let exported =
            lane["exported"].as_bool().ok_or_else(|| invalid("lane reset export state"))?;
        let key = bitmap_key(rows, scope, name)?;
        if rows[&key]["config"]["teambit.component/remove"]["removed"] == true
            || rows[&key]["isAvailableOnCurrentLane"] == false
        {
            return Err(invalid("lane reset unavailable component"));
        }
        Ok(Self { before, document, key, lane_scope, lane_name, exported })
    }

    fn validate_head(&self, head: &str) -> io::Result<()> {
        if self.document[&self.key]["version"] != head {
            return Err(invalid("lane reset bitmap head mismatch"));
        }
        Ok(())
    }

    fn project(&mut self, model: &Value, next: Option<String>) -> io::Result<String> {
        let version = next.map_or_else(String::new, |hash| {
            model["versions"]
                .as_object()
                .and_then(|versions| {
                    versions
                        .iter()
                        .find_map(|(tag, value)| (value == &hash).then_some(tag.clone()))
                })
                .unwrap_or(hash)
        });
        let row = self.document[&self.key]
            .as_object_mut()
            .ok_or_else(|| invalid("lane reset bitmap row"))?;
        row.insert("version".into(), Value::String(version.clone()));
        row.shift_remove("nextVersion");
        if version.is_empty()
            && model["versions"].as_object().is_some_and(serde_json::Map::is_empty)
        {
            row.shift_remove("onLanesOnly");
            row.shift_remove("isAvailableOnCurrentLane");
        }
        Ok(version)
    }

    fn after(&self) -> io::Result<Vec<u8>> {
        crate::inspection::render_bitmap(&self.document)
    }
}

struct Repository {
    objects: PathBuf,
    lane_scope: String,
    lane_name: String,
    lane_hash: String,
    lane: Value,
    lane_position: usize,
    heads: Heads,
    model: Value,
}

struct Heads {
    current: String,
    remote: Option<String>,
}

impl Heads {
    fn is_remote(&self, hash: &str) -> bool {
        self.remote.as_deref() == Some(hash)
    }
}

impl Repository {
    fn load(root: &Path, bitmap: &BitmapState, scope: &str, name: &str) -> io::Result<Self> {
        let index: Value = serde_json::from_slice(&fs::read(root.join(".bit/index.json"))?)?;
        let lane_hash = indexed_hash(&index, "lanes", &bitmap.lane_scope, &bitmap.lane_name)?;
        let model_hash = indexed_hash(&index, "components", scope, name)?;
        let objects = root.join(".bit/objects");
        let model = outbound::read_object(&objects, &model_hash, "Component")?;
        if model["scope"] != scope || model["name"] != name {
            return Err(invalid("lane reset Component identity"));
        }
        let lane = outbound::read_object(&objects, &lane_hash, "Lane")?;
        if lane["scope"] != bitmap.lane_scope || lane["name"] != bitmap.lane_name {
            return Err(invalid("lane reset Lane identity"));
        }
        let lane_rows =
            lane["components"].as_array().ok_or_else(|| invalid("lane reset Lane components"))?;
        let lane_position = unique_position(lane_rows, scope, name)?;
        let current = lane_rows[lane_position]["head"]
            .as_str()
            .ok_or_else(|| invalid("lane reset head"))?
            .to_owned();
        crate::merge_history::hash(&current)?;
        let remote_head = exported_head(root, bitmap, scope, name, &model)?;
        Ok(Self {
            objects,
            lane_scope: bitmap.lane_scope.clone(),
            lane_name: bitmap.lane_name.clone(),
            lane_hash,
            lane,
            lane_position,
            heads: Heads { current, remote: remote_head },
            model,
        })
    }

    fn project_lane(&mut self, next: Option<&str>, head_only: bool) -> io::Result<()> {
        let next_on_lane = next
            .map(|next| self.is_lane_origin(next))
            .transpose()?
            .unwrap_or(false);
        let rows = self.lane["components"]
            .as_array_mut()
            .ok_or_else(|| invalid("lane reset Lane components"))?;
        if next_on_lane || (head_only && next.is_some()) {
            rows[self.lane_position]["head"] =
                Value::String(next.ok_or_else(|| invalid("lane reset parent"))?.to_owned());
        } else {
            rows.remove(self.lane_position);
        }
        Ok(())
    }

    fn is_lane_origin(&self, hash: &str) -> io::Result<bool> {
        is_lane_origin(&self.objects, hash, &self.lane_hash, &self.lane_scope, &self.lane_name)
    }

    fn lane_object(&self) -> io::Result<ObjectChange> {
        changed(&self.objects, &self.lane_hash, "Lane", &self.lane)
    }
}

#[derive(Clone)]
struct Selection {
    removed: Vec<String>,
    next: Option<String>,
    labels: Vec<String>,
}

impl Selection {
    fn new(removed: Vec<String>, next: Option<String>, head_only: bool) -> Self {
        let mut labels = removed.clone();
        if !head_only {
            labels.reverse();
        }
        Self { removed, next, labels }
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
        bitmap.validate_head(&repository.heads.current)?;
        let selection = select(&repository, head_only)?;
        if !force {
            dependents::validate(root, identity, &selection.removed)?;
        }
        let mut objects = project_objects(&mut repository, identity, &selection, head_only)?;
        let bitmap_version = bitmap.project(&repository.model, selection.next.clone())?;
        let bitmap_after = bitmap.after()?;
        let bitmap =
            BitmapChange { before: bitmap.before, after: bitmap_after, version: bitmap_version };
        let index = if selection.next.is_none()
            && repository.model["versions"].as_object().is_some_and(serde_json::Map::is_empty)
            && !repository.model["head"].is_string()
        {
            let (removed, index) = remove_new_model(root, scope, name)?;
            objects.push(removed);
            Some(index)
        } else {
            None
        };
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
        {
            return Err(invalid("lane reset changed during preparation"));
        }
        for object in &self.objects {
            let path = object_path(&self.root.join(".bit/objects"), &object.hash);
            if let Some(after) = &object.after {
                fs::create_dir_all(
                    path.parent().ok_or_else(|| invalid("lane reset object path"))?,
                )?;
                fs::write(path, after)?;
            } else {
                fs::remove_file(path)?;
            }
        }
        if let Some(index) = &self.index {
            fs::write(self.root.join(".bit/index.json"), &index.after)?;
        }
        crate::reset_main::backup_bitmap(&self.root, file_id)?;
        fs::write(self.root.join(".bitmap"), &self.bitmap.after)
    }
}

fn project_objects(
    repository: &mut Repository,
    identity: &str,
    selection: &Selection,
    head_only: bool,
) -> io::Result<Vec<ObjectChange>> {
    let history = version_history(repository, identity)?;
    let lane_history = lane_history(repository, &selection.removed)?;
    let pending = pending_histories(
        &repository.objects,
        &repository.lane,
        &HashSet::from([identity.to_owned()]),
    )?;
    repository.project_lane(selection.next.as_deref(), head_only)?;
    let mut objects = vec![history, lane_history, repository.lane_object()?];
    objects.extend(pending);
    Ok(objects)
}

fn select(repository: &Repository, head_only: bool) -> io::Result<Selection> {
    let mut current = repository.heads.current.clone();
    if repository.heads.is_remote(&current) {
        return Err(invalid("lane reset head is exported"));
    }
    let mut removed = Vec::new();
    let mut seen = HashSet::new();
    loop {
        if !seen.insert(current.clone()) || seen.len() > 4096 {
            return Err(invalid("lane reset cyclic or oversized history"));
        }
        let next = local_parent(repository, &current)?;
        removed.push(current);
        if head_only || reached_boundary(repository, next.as_deref())? {
            return Ok(Selection::new(removed, next, head_only));
        }
        current = next.ok_or_else(|| invalid("lane reset missing parent"))?;
    }
}

fn local_parent(repository: &Repository, hash: &str) -> io::Result<Option<String>> {
    if !repository.is_lane_origin(hash)? {
        return Err(invalid("lane reset head is not local"));
    }
    let version = outbound::read_object(&repository.objects, hash, "Version")?;
    let parents = version["parents"].as_array().ok_or_else(|| invalid("lane reset parents"))?;
    match parents.as_slice() {
        [] => Ok(None),
        [parent] => parent
            .as_str()
            .map(|parent| Some(parent.to_owned()))
            .ok_or_else(|| invalid("lane reset parent")),
        _ => Err(invalid("lane reset merge parents")),
    }
}

fn is_lane_origin(
    objects: &Path,
    hash: &str,
    lane_hash: &str,
    scope: &str,
    name: &str,
) -> io::Result<bool> {
    let version = outbound::read_object(objects, hash, "Version")?;
    Ok(version["origin"]["lane"]["hash"] == lane_hash
        && version["origin"]["lane"]["scope"] == scope
        && version["origin"]["lane"]["name"] == name)
}

fn changed(objects: &Path, hash: &str, kind: &str, value: &Value) -> io::Result<ObjectChange> {
    Ok(ObjectChange {
        hash: hash.to_owned(),
        before: fs::read(object_path(objects, hash))?,
        after: Some(outbound::encode_object(hash, kind, value)?),
    })
}

fn bitmap_key(
    rows: &serde_json::Map<String, Value>,
    scope: &str,
    name: &str,
) -> io::Result<String> {
    let mut found = None;
    for (key, row) in rows {
        if key.starts_with('$') || key == "_bit_lane" || !row.is_object() {
            continue;
        }
        let row_scope = row["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
            .or_else(|| row["defaultScope"].as_str());
        if row_scope == Some(scope) && row["name"] == name && found.replace(key.clone()).is_some() {
            return Err(invalid("lane reset ambiguous bitmap identity"));
        }
    }
    found.ok_or_else(|| invalid("lane reset bitmap identity absent"))
}

fn indexed_hash(index: &Value, section: &str, scope: &str, name: &str) -> io::Result<String> {
    let rows = index[section].as_array().ok_or_else(|| invalid("lane reset index section"))?;
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
            (row["id"]["scope"] == scope && row["id"]["name"] == name).then_some(index)
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
