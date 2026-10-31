//! One publication for `bit reset --silent` across staged main-lane Components.

use super::{BytesChange, Plan, bitmap::find_key, invalid, outbound};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub struct Batch {
    root: PathBuf,
    head_only: bool,
    selected: Option<Selected>,
    items: Vec<Plan>,
    bitmap: BytesChange,
    index: Option<BytesChange>,
    controls: Vec<crate::reset_lane::controls::Control>,
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
        let identities = identities
            .iter()
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(str::to_owned)
            .collect();
        Self::prepare_with(root, head_only, Some(Selected { identities, force }))
    }

    fn prepare_with(root: &Path, head_only: bool, selected: Option<Selected>) -> io::Result<Self> {
        let mut ids = candidates(root)?;
        if let Some(selected) = &selected {
            ids.retain(|id| selected.identities.contains(id));
            if ids.is_empty() {
                return Err(invalid("no selected components found to reset"));
            }
        }
        let items = ids
            .iter()
            .map(|id| {
                Plan::prepare(
                    root,
                    id,
                    head_only,
                    selected.as_ref().is_none_or(|selected| selected.force),
                )
            })
            .collect::<io::Result<Vec<_>>>()?;
        let bitmap = project_bitmap(root, &items)?;
        let index = project_index(root, &items)?;
        let controls = crate::reset_lane::controls::prepare(root, &ids)?;
        Ok(Self { root: root.to_owned(), head_only, selected, items, bitmap, index, controls })
    }

    pub fn results(&self) -> impl Iterator<Item = (&str, &[String])> {
        self.items
            .iter()
            .map(|item| (item.input.identity.as_str(), item.selection.labels.as_slice()))
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        super::validate_file_id(file_id)?;
        let fresh = Self::prepare_with(&self.root, self.head_only, self.selected.clone())?;
        if self.bitmap != fresh.bitmap
            || self.index != fresh.index
            || self.controls != fresh.controls
            || self.items
                .iter()
                .map(|item| &item.object)
                .collect::<Vec<_>>()
                != fresh.items
                    .iter()
                    .map(|item| &item.object)
                    .collect::<Vec<_>>()
            || self.items
                .iter()
                .map(|item| &item.history)
                .collect::<Vec<_>>()
                != fresh.items
                    .iter()
                    .map(|item| &item.history)
                    .collect::<Vec<_>>()
        {
            return Err(invalid("reset batch changed during preparation"));
        }
        for item in &self.items {
            super::publication::write_object(&self.root, &item.object)?;
            if let Some(history) = &item.history {
                super::publication::write_object(&self.root, history)?;
            }
        }
        if let Some(index) = &self.index {
            fs::write(crate::scope_path(&self.root).join("index.json"), &index.after)?;
        }
        crate::reset_lane::controls::publish(&self.controls)?;
        super::backup_bitmap(&self.root, file_id)?;
        fs::write(self.root.join(".bitmap"), &self.bitmap.after)
    }
}

fn candidates(root: &Path) -> io::Result<Vec<String>> {
    let index: Value = crate::parse_jsonc(&fs::read(crate::scope_path(root).join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("reset batch index"))?;
    let mut selected = Vec::new();
    for row in rows {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("reset batch model hash"))?;
        let model =
            outbound::read_object(&crate::scope_path(root).join("objects"), hash, "Component")?;
        if model["state"]["versions"]
            .as_object()
            .is_some_and(|state| {
                state
                    .values()
                    .any(|version| version["local"] == true)
            })
        {
            selected.push(identity(row)?);
        }
    }
    if selected.is_empty() {
        return Err(invalid("no components found to reset"));
    }
    Ok(selected)
}

fn identity(row: &Value) -> io::Result<String> {
    let (scope_opt, name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .ok_or_else(|| invalid("reset batch name"))?;
    let scope = scope_opt
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("reset batch scope"))?;
    Ok(format!("{scope}/{name}"))
}

fn project_bitmap(root: &Path, items: &[Plan]) -> io::Result<BytesChange> {
    let before = fs::read(root.join(".bitmap"))?;
    let mut document = crate::recovery::jsonc::parse(&before)?;
    for item in items {
        apply_bitmap(&mut document, item)?;
    }
    let after = crate::inspection::render_bitmap(&document)?;
    Ok(BytesChange { before, after })
}

fn apply_bitmap(document: &mut Value, item: &Plan) -> io::Result<()> {
    let (scope, name) =
        item.input.identity.split_once('/').ok_or_else(|| invalid("reset batch identity"))?;
    let fields = document.as_object_mut().ok_or_else(|| invalid("reset batch bitmap"))?;
    let key = find_key(fields, scope, name)?;
    let single = crate::recovery::jsonc::parse(&item.bitmap.after)?;
    let version = single[&key]["version"].as_str().ok_or_else(|| invalid("reset batch version"))?;
    let row = fields[&key].as_object_mut().ok_or_else(|| invalid("reset batch row"))?;
    row.insert("version".into(), Value::String(version.to_owned()));
    row.shift_remove("nextVersion");
    crate::reset_config::restore(row, single[&key].get("config").cloned());
    Ok(())
}

fn project_index(root: &Path, items: &[Plan]) -> io::Result<Option<BytesChange>> {
    if items.iter().all(|item| item.index.is_none()) {
        return Ok(None);
    }
    let before = fs::read(crate::scope_path(root).join("index.json"))?;
    let mut index: Value = crate::parse_jsonc(&before)?;
    let rows =
        if index.is_array() { index.as_array_mut() } else { index["components"].as_array_mut() }
            .ok_or_else(|| invalid("reset batch index"))?;
    for item in items.iter().filter(|item| item.index.is_some()) {
        let position = rows
            .iter()
            .position(|row| row["hash"] == item.object.hash)
            .ok_or_else(|| invalid("reset batch model absent"))?;
        rows.remove(position);
    }
    let mut after = serde_json::to_vec_pretty(&index)?;
    after.push(b'\n');
    Ok(Some(BytesChange { before, after }))
}
