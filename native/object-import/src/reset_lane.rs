//! Reset linear, unexported lane snapshots without hydrating files through Node.

#[cfg(test)]
mod tests;

use crate::workspace::engine::command::outbound;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(PartialEq)]
struct ObjectChange {
    hash: String,
    before: Vec<u8>,
    after: Vec<u8>,
}

/// A fully prepared explicit lane reset. Unsupported graph and lane states
/// decline before any object or bitmap changes.
pub struct Plan {
    root: PathBuf,
    identity: String,
    head_only: bool,
    objects: Vec<ObjectChange>,
    bitmap_before: Vec<u8>,
    bitmap_after: Vec<u8>,
    pub labels: Vec<String>,
}

struct BitmapState {
    before: Vec<u8>,
    document: Value,
    key: String,
    lane_scope: String,
    lane_name: String,
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
        if lane["exported"] != false {
            return Err(invalid("lane reset exported lane"));
        }
        let key = bitmap_key(rows, scope, name)?;
        if rows[&key]["config"]["teambit.component/remove"]["removed"] == true
            || rows[&key]["isAvailableOnCurrentLane"] == false
        {
            return Err(invalid("lane reset unavailable component"));
        }
        Ok(Self { before, document, key, lane_scope, lane_name })
    }

    fn validate_head(&self, head: &str) -> io::Result<()> {
        if self.document[&self.key]["version"] != head {
            return Err(invalid("lane reset bitmap head mismatch"));
        }
        Ok(())
    }

    fn project(&mut self, model: &Value, next: Option<String>) -> io::Result<()> {
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
        row.insert("version".into(), Value::String(version));
        row.shift_remove("nextVersion");
        Ok(())
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
    current: String,
    model: Value,
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
        Ok(Self {
            objects,
            lane_scope: bitmap.lane_scope.clone(),
            lane_name: bitmap.lane_name.clone(),
            lane_hash,
            lane,
            lane_position,
            current,
            model,
        })
    }

    fn project_lane(&mut self, next: Option<&str>) -> io::Result<()> {
        let next_on_lane = next
            .map(|next| self.is_lane_origin(next))
            .transpose()?
            .unwrap_or(false);
        let rows = self.lane["components"]
            .as_array_mut()
            .ok_or_else(|| invalid("lane reset Lane components"))?;
        if next_on_lane {
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

struct Selection {
    removed: Vec<String>,
    next: Option<String>,
    labels: Vec<String>,
}

impl Plan {
    pub fn prepare(root: &Path, identity: &str, head_only: bool) -> io::Result<Self> {
        let (scope, name) = identity
            .split_once('/')
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("lane reset identity"))?;
        let mut bitmap = BitmapState::load(root, scope, name)?;
        let mut repository = Repository::load(root, &bitmap, scope, name)?;
        bitmap.validate_head(&repository.current)?;
        let selection = select(&repository, head_only)?;
        let history = version_history(&repository, identity)?;
        let lane_history = lane_history(&repository, &selection.removed)?;
        repository.project_lane(selection.next.as_deref())?;
        bitmap.project(&repository.model, selection.next)?;
        let objects = vec![history, lane_history, repository.lane_object()?];
        let bitmap_after = bitmap.after()?;
        Ok(Self {
            root: root.to_owned(),
            identity: identity.to_owned(),
            head_only,
            objects,
            bitmap_before: bitmap.before,
            bitmap_after,
            labels: selection.labels,
        })
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        crate::reset_main::validate_file_id(file_id)?;
        let fresh = Self::prepare(&self.root, &self.identity, self.head_only)?;
        if self.objects != fresh.objects
            || self.bitmap_before != fresh.bitmap_before
            || self.bitmap_after != fresh.bitmap_after
        {
            return Err(invalid("lane reset changed during preparation"));
        }
        for object in &self.objects {
            fs::write(object_path(&self.root.join(".bit/objects"), &object.hash), &object.after)?;
        }
        crate::reset_main::backup_bitmap(&self.root, file_id)?;
        fs::write(self.root.join(".bitmap"), &self.bitmap_after)
    }
}

fn select(repository: &Repository, head_only: bool) -> io::Result<Selection> {
    let mut current = repository.current.clone();
    let mut removed = Vec::new();
    let mut seen = HashSet::new();
    loop {
        if !seen.insert(current.clone()) || seen.len() > 4096 {
            return Err(invalid("lane reset cyclic or oversized history"));
        }
        let next = local_parent(repository, &current)?;
        removed.push(current);
        let next_on_lane = next
            .as_ref()
            .map(|next| repository.is_lane_origin(next))
            .transpose()?
            .unwrap_or(false);
        if head_only || !next_on_lane {
            let mut labels = removed.clone();
            if !head_only {
                labels.reverse();
            }
            return Ok(Selection { removed, next, labels });
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

fn version_history(repository: &Repository, identity: &str) -> io::Result<ObjectChange> {
    let hash = object_hash(&format!("{identity}:VersionHistory"));
    let mut history = outbound::read_object(&repository.objects, &hash, "VersionHistory")?;
    if history["scope"] != repository.model["scope"] || history["name"] != repository.model["name"]
    {
        return Err(invalid("lane reset VersionHistory identity"));
    }
    let versions = history["versions"]
        .as_array_mut()
        .ok_or_else(|| invalid("lane reset VersionHistory versions"))?;
    if !versions
        .iter()
        .any(|row| row["hash"] == repository.current)
    {
        let version = outbound::read_object(&repository.objects, &repository.current, "Version")?;
        versions.push(json!({"hash":repository.current,"parents":version["parents"]}));
    }
    changed(&repository.objects, &hash, "VersionHistory", &history)
}

fn lane_history(repository: &Repository, removed: &[String]) -> io::Result<ObjectChange> {
    let hash = object_hash(&format!("{}:LaneHistory", repository.lane_hash));
    let mut history = outbound::read_object(&repository.objects, &hash, "LaneHistory")?;
    if history["laneHash"] != repository.lane_hash
        || history["scope"] != repository.lane_scope
        || history["name"] != repository.lane_name
    {
        return Err(invalid("lane reset LaneHistory identity"));
    }
    let batches = batch_ids(&repository.objects, removed)?;
    let entries =
        history["history"].as_object_mut().ok_or_else(|| invalid("lane reset history entries"))?;
    for batch in batches {
        if entries.shift_remove(&batch).is_none() {
            return Err(invalid("lane reset history batch absent"));
        }
    }
    changed(&repository.objects, &hash, "LaneHistory", &history)
}

fn batch_ids(objects: &Path, removed: &[String]) -> io::Result<HashSet<String>> {
    removed
        .iter()
        .map(|hash| {
            let version = outbound::read_object(objects, hash, "Version")?;
            version["batchId"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("lane reset batch id"))
        })
        .collect()
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
        after: outbound::encode_object(hash, kind, value)?,
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
