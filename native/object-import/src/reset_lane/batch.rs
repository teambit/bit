//! One lane and bitmap publication for `bit reset --silent` on a lane.

#[cfg(test)]
mod tests;

use super::{
    BytesChange, ObjectChange, Plan, bitmap_key, changed, history::batch_ids, indexed_hash,
    invalid, is_lane_origin, object_path, outbound, pending_histories, remote::remote_head,
    unique_position,
};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub struct Batch {
    root: PathBuf,
    head_only: bool,
    items: Vec<Plan>,
    objects: Vec<ObjectChange>,
    bitmap_before: Vec<u8>,
    bitmap_after: Vec<u8>,
    index: Option<BytesChange>,
}

impl Batch {
    pub fn prepare(root: &Path, head_only: bool) -> io::Result<Self> {
        let identities = candidates(root)?;
        let items = identities
            .iter()
            .map(|id| Plan::prepare(root, id, head_only, true))
            .collect::<io::Result<Vec<_>>>()?;
        let objects = project_objects(root, &items)?;
        let (bitmap_before, bitmap_after) = project_bitmap(root, &items)?;
        let index = project_index(root, &items)?;
        Ok(Self {
            root: root.to_owned(),
            head_only,
            items,
            objects,
            bitmap_before,
            bitmap_after,
            index,
        })
    }

    pub fn results(&self) -> impl Iterator<Item = (&str, &[String])> {
        self.items
            .iter()
            .map(|item| (item.identity.as_str(), item.labels()))
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        crate::reset_main::validate_file_id(file_id)?;
        let fresh = Self::prepare(&self.root, self.head_only)?;
        if self.objects != fresh.objects
            || self.bitmap_before != fresh.bitmap_before
            || self.bitmap_after != fresh.bitmap_after
            || self.index != fresh.index
        {
            return Err(invalid("lane reset batch changed during preparation"));
        }
        for object in &self.objects {
            let path = object_path(&self.root.join(".bit/objects"), &object.hash);
            if let Some(after) = &object.after {
                fs::create_dir_all(
                    path.parent().ok_or_else(|| invalid("lane batch object path"))?,
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
        fs::write(self.root.join(".bitmap"), &self.bitmap_after)
    }
}

fn candidates(root: &Path) -> io::Result<Vec<String>> {
    let (scope, name, exported) = lane_context(root)?;
    let index: Value = serde_json::from_slice(&fs::read(root.join(".bit/index.json"))?)?;
    let hash = indexed_hash(&index, "lanes", &scope, &name)?;
    let objects = root.join(".bit/objects");
    let lane = outbound::read_object(&objects, &hash, "Lane")?;
    let rows = lane["components"].as_array().ok_or_else(|| invalid("lane batch components"))?;
    let mut selected = Vec::new();
    for row in rows {
        if let Some(identity) = candidate(root, &objects, &index, &scope, &name, exported, row)? {
            selected.push(identity);
        }
    }
    if selected.is_empty() {
        return Err(invalid("no components found to reset on your workspace"));
    }
    selected.sort();
    Ok(selected)
}

fn lane_context(root: &Path) -> io::Result<(String, String, bool)> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap"))?)?;
    let lane = &bitmap["_bit_lane"];
    let scope = lane["id"]["scope"].as_str().ok_or_else(|| invalid("lane batch scope"))?;
    let name = lane["id"]["name"].as_str().ok_or_else(|| invalid("lane batch name"))?;
    let exported = lane["exported"].as_bool().ok_or_else(|| invalid("lane batch export state"))?;
    Ok((scope.to_owned(), name.to_owned(), exported))
}

fn candidate(
    root: &Path,
    objects: &Path,
    index: &Value,
    lane_scope: &str,
    lane_name: &str,
    exported: bool,
    row: &Value,
) -> io::Result<Option<String>> {
    let scope = row["id"]["scope"].as_str().ok_or_else(|| invalid("lane batch component scope"))?;
    let name = row["id"]["name"].as_str().ok_or_else(|| invalid("lane batch component name"))?;
    let head = row["head"].as_str().ok_or_else(|| invalid("lane batch component head"))?;
    if exported {
        return remote_head(root, lane_scope, lane_name, scope, name)
            .map(|remote| (remote.as_deref() != Some(head)).then(|| format!("{scope}/{name}")));
    }
    let hash = indexed_hash(index, "components", scope, name)?;
    let component = outbound::read_object(objects, &hash, "Component")?;
    let main = component["versions"].as_object().ok_or_else(|| invalid("lane batch versions"))?;
    Ok((!main
        .values()
        .any(|version| version == head))
    .then(|| format!("{scope}/{name}")))
}

fn project_objects(root: &Path, items: &[Plan]) -> io::Result<Vec<ObjectChange>> {
    let objects = root.join(".bit/objects");
    let first = items.first().ok_or_else(|| invalid("lane batch empty"))?;
    let lane_hash = &first.objects[2].hash;
    let history_hash = &first.objects[1].hash;
    let mut lane = outbound::read_object(&objects, lane_hash, "Lane")?;
    let mut history = outbound::read_object(&objects, history_hash, "LaneHistory")?;
    let selected = items
        .iter()
        .map(|item| item.identity.clone())
        .collect::<HashSet<_>>();
    let pending = pending_histories(&objects, &lane, &selected)?;
    let mut batches = HashSet::new();
    for item in items {
        if &item.objects[2].hash != lane_hash || &item.objects[1].hash != history_hash {
            return Err(invalid("lane batch mixed lane objects"));
        }
        apply_lane(&objects, &mut lane, item)?;
        batches.extend(batch_ids(&objects, &item.selection.removed)?);
    }
    remove_batches(&mut history, batches)?;
    let mut changes = items
        .iter()
        .map(|item| item.objects[0].clone())
        .collect::<Vec<_>>();
    changes.push(changed(&objects, history_hash, "LaneHistory", &history)?);
    changes.push(changed(&objects, lane_hash, "Lane", &lane)?);
    changes.extend(pending);
    changes.extend(
        items
            .iter()
            .flat_map(|item| {
                item.objects
                    .iter()
                    .filter(|object| object.after.is_none())
                    .cloned()
            }),
    );
    Ok(changes)
}

fn apply_lane(objects: &Path, lane: &mut Value, item: &Plan) -> io::Result<()> {
    let (scope, name) =
        item.identity.split_once('/').ok_or_else(|| invalid("lane batch identity"))?;
    let head = item.selection.next.as_deref();
    let on_lane = head
        .map(|head| {
            is_lane_origin(
                objects,
                head,
                &item.objects[2].hash,
                lane["scope"].as_str().unwrap_or_default(),
                lane["name"].as_str().unwrap_or_default(),
            )
        })
        .transpose()?
        .unwrap_or(false);
    let rows = lane["components"].as_array_mut().ok_or_else(|| invalid("lane batch lane rows"))?;
    let position = rows
        .iter()
        .position(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        .ok_or_else(|| invalid("lane batch lane row absent"))?;
    if on_lane || (item.head_only && head.is_some()) {
        rows[position]["head"] =
            Value::String(head.ok_or_else(|| invalid("lane batch parent"))?.to_owned());
    } else {
        rows.remove(position);
    }
    Ok(())
}

fn remove_batches(history: &mut Value, batches: HashSet<String>) -> io::Result<()> {
    let entries =
        history["history"].as_object_mut().ok_or_else(|| invalid("lane batch history entries"))?;
    for batch in batches {
        if entries.shift_remove(&batch).is_none() {
            return Err(invalid("lane batch history entry absent"));
        }
    }
    Ok(())
}

fn project_bitmap(root: &Path, items: &[Plan]) -> io::Result<(Vec<u8>, Vec<u8>)> {
    let before = fs::read(root.join(".bitmap"))?;
    let mut bitmap = crate::recovery::jsonc::parse(&before)?;
    for item in items {
        let (scope, name) =
            item.identity.split_once('/').ok_or_else(|| invalid("lane batch identity"))?;
        let rows = bitmap.as_object_mut().ok_or_else(|| invalid("lane batch bitmap"))?;
        let key = bitmap_key(rows, scope, name)?;
        let row = rows[&key].as_object_mut().ok_or_else(|| invalid("lane batch bitmap row"))?;
        row.insert("version".into(), Value::String(item.bitmap.version.clone()));
        row.shift_remove("nextVersion");
        if item.index.is_some() {
            row.shift_remove("onLanesOnly");
            row.shift_remove("isAvailableOnCurrentLane");
        }
    }
    Ok((before, crate::inspection::render_bitmap(&bitmap)?))
}

fn project_index(root: &Path, items: &[Plan]) -> io::Result<Option<BytesChange>> {
    if items.iter().all(|item| item.index.is_none()) {
        return Ok(None);
    }
    let before = fs::read(root.join(".bit/index.json"))?;
    let mut index: Value = serde_json::from_slice(&before)?;
    let rows =
        index["components"].as_array_mut().ok_or_else(|| invalid("lane batch index components"))?;
    for item in items.iter().filter(|item| item.index.is_some()) {
        let (scope, name) =
            item.identity.split_once('/').ok_or_else(|| invalid("lane batch identity"))?;
        let position = unique_position(rows, scope, name)?;
        rows.remove(position);
    }
    let mut after = serde_json::to_vec_pretty(&index)?;
    after.push(b'\n');
    Ok(Some(BytesChange { before, after }))
}
