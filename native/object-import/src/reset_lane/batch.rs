//! One lane and bitmap publication for `bit reset --silent` on a lane.

mod candidates;
#[cfg(test)]
mod tests;

use super::{
    BytesChange, ObjectChange, Plan, bitmap, bitmap_key, changed, diagnostics, history::batch_ids,
    invalid, membership, outbound, pending_histories, unique_position,
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
    selected: Option<Selected>,
    items: Vec<Plan>,
    objects: Vec<ObjectChange>,
    bitmap_before: Vec<u8>,
    bitmap_after: Vec<u8>,
    index: Option<BytesChange>,
}

#[derive(Clone)]
struct Selected {
    identities: Vec<String>,
    force: bool,
}

impl Batch {
    pub fn prepare(root: &Path, head_only: bool) -> io::Result<Self> {
        Self::prepare_with(root, head_only, None)
    }

    pub fn prepare_selected(
        root: &Path,
        identities: &[String],
        head_only: bool,
        force: bool,
    ) -> io::Result<Self> {
        Self::prepare_with(
            root,
            head_only,
            Some(Selected { identities: identities.to_vec(), force }),
        )
    }

    fn prepare_with(root: &Path, head_only: bool, selected: Option<Selected>) -> io::Result<Self> {
        let discovery = candidates::prepare(root)?;
        let mut identities = discovery.identities.clone();
        if let Some(selected) = &selected {
            identities.retain(|id| selected.identities.contains(id));
        }
        let mut items = prepare_items(
            root,
            &identities,
            head_only,
            selected.as_ref().is_none_or(|selected| selected.force),
        )
        .map_err(|error| discovery.failure(error))?;
        Self::assemble(root, head_only, selected, &mut items, discovery)
    }

    fn assemble(
        root: &Path,
        head_only: bool,
        selected: Option<Selected>,
        items: &mut Vec<Plan>,
        discovery: candidates::Discovery,
    ) -> io::Result<Self> {
        let population = discovery.population
            .into_iter()
            .chain(items.iter().flat_map(|item| item.selection.population.clone()))
            .collect();
        let retained = discovery.proofs
            .into_iter()
            .chain(items.iter().flat_map(|item| item.selection.proofs.clone()))
            .collect::<Vec<_>>();
        if let Some(first) = items.first_mut() {
            first.selection.population = population;
            first.selection.proofs = retained;
            let identities = items
                .iter()
                .map(|item| item.identity.clone())
                .collect::<Vec<_>>();
            items[0].selection.controls = super::controls::prepare(root, &identities)?;
        }
        let objects = project_objects(root, items)?;
        let (bitmap_before, bitmap_after) = project_bitmap(root, items)?;
        let index = project_index(root, items)?;
        Ok(Self {
            root: root.to_owned(),
            head_only,
            selected,
            items: std::mem::take(items),
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
        let fresh = Self::prepare_with(&self.root, self.head_only, self.selected.clone())?;
        if self.objects != fresh.objects
            || self.bitmap_before != fresh.bitmap_before
            || self.bitmap_after != fresh.bitmap_after
            || self.index != fresh.index
            || self.items
                .iter()
                .map(|item| &item.selection)
                .collect::<Vec<_>>()
                != fresh.items
                    .iter()
                    .map(|item| &item.selection)
                    .collect::<Vec<_>>()
        {
            return Err(invalid("lane reset batch changed during preparation"));
        }
        if let Some(first) = self.items.first() {
            let population = diagnostics::with_population(
                diagnostics::error("candidate graph population"),
                &crate::scope_path(&self.root).join("objects"),
                first.selection.population.clone(),
                first.selection.proofs.clone(),
            );
            diagnostics::apply_error_prefix(&population)?;
        }
        super::write_objects(&self.root, &self.objects)?;
        if let Some(index) = &self.index {
            fs::write(crate::scope_path(&self.root).join("index.json"), &index.after)?;
        }
        if let Some(first) = self.items.first() {
            super::controls::publish(&first.selection.controls)?;
        }
        crate::reset_main::backup_bitmap(&self.root, file_id)?;
        fs::write(self.root.join(".bitmap"), &self.bitmap_after)
    }
}

fn prepare_items(
    root: &Path,
    identities: &[String],
    head_only: bool,
    force: bool,
) -> io::Result<Vec<Plan>> {
    if identities.is_empty() {
        return Err(diagnostics::error("no components found to reset on your workspace"));
    }
    let mut items: Vec<Plan> = Vec::new();
    for identity in identities {
        let item = Plan::prepare(root, identity, head_only, force)
            .map_err(|error| earlier_failure(&items, error))?;
        items.push(item);
    }
    Ok(items)
}

fn earlier_failure(items: &[Plan], mut error: io::Error) -> io::Error {
    for item in items.iter().rev() {
        error = diagnostics::with_population(
            error,
            &crate::scope_path(&item.root).join("objects"),
            item.selection.population.clone(),
            item.selection.proofs.clone(),
        );
    }
    error
}

fn project_objects(root: &Path, items: &[Plan]) -> io::Result<Vec<ObjectChange>> {
    let objects = crate::scope_path(root).join("objects");
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
    append_model_changes(&mut changes, items);
    merge_populations(&mut changes, items);
    Ok(changes)
}

fn append_model_changes(changes: &mut Vec<ObjectChange>, items: &[Plan]) {
    changes.extend(
        items
            .iter()
            .flat_map(|item| {
                item.objects
                    .iter()
                    .skip(3)
                    .filter(|object| {
                        object.after.is_some() && object.hash == super::object_hash(&item.identity)
                    })
                    .cloned()
            }),
    );
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
}

fn merge_populations(changes: &mut Vec<ObjectChange>, items: &[Plan]) {
    let Some(first) = items.first() else { return };
    for population in &first.selection.population {
        if items
            .iter()
            .any(|item| item.objects[0].hash == population.hash)
        {
            continue;
        }
        if let Some(existing) = changes
            .iter_mut()
            .find(|object| object.hash == population.hash)
        {
            existing.after.clone_from(&population.after);
        } else {
            changes.push(population.clone());
        }
    }
}

fn apply_lane(_objects: &Path, lane: &mut Value, item: &Plan) -> io::Result<()> {
    let (scope, name) =
        item.identity.split_once('/').ok_or_else(|| invalid("lane batch identity"))?;
    membership::project(lane, scope, name, &item.selection)
}

fn remove_batches(history: &mut Value, batches: HashSet<String>) -> io::Result<()> {
    let entries =
        history["history"].as_object_mut().ok_or_else(|| invalid("lane batch history entries"))?;
    for batch in batches {
        entries.shift_remove(&batch);
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
        if item.bitmap.before == item.bitmap.after && bitmap_key(rows, scope, name).is_err() {
            continue;
        }
        let single = crate::recovery::jsonc::parse(&item.bitmap.after)?;
        let key = if let Ok(key) = bitmap_key(rows, scope, name) {
            key
        } else {
            let single_rows =
                single.as_object().ok_or_else(|| invalid("lane batch projected bitmap"))?;
            let single_key = bitmap_key(single_rows, scope, name)?;
            bitmap::insert(rows, &single_key, single[&single_key].clone())?;
            bitmap_key(rows, scope, name)?
        };
        let row = rows[&key].as_object_mut().ok_or_else(|| invalid("lane batch bitmap row"))?;
        row.insert("version".into(), Value::String(item.bitmap.version.clone()));
        row.shift_remove("nextVersion");
        crate::reset_config::restore(row, single[&key].get("config").cloned());
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
    let before = fs::read(crate::scope_path(root).join("index.json"))?;
    let mut index: Value = serde_json::from_slice(&before)?;
    let rows =
        if index.is_array() { index.as_array_mut() } else { index["components"].as_array_mut() }
            .ok_or_else(|| invalid("lane batch index components"))?;
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
