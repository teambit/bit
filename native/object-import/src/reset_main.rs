//! Main-lane reset selection. The component and Version objects are the source
//! of truth; a bitmap version alone cannot tell local snaps from exported ones.

use crate::workspace::engine::command::outbound::model;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs, io,
    io::Write,
    path::{Path, PathBuf},
};

/// A prepared main-lane reset. No files change until `commit`, which checks
/// the bitmap, index, and Component object that produced this exact result.
pub struct Plan {
    root: PathBuf,
    identity: String,
    head_only: bool,
    force: bool,
    model_hash: String,
    before_model: Vec<u8>,
    before_bitmap: Vec<u8>,
    before_index: Vec<u8>,
    after_model: Option<Vec<u8>>,
    after_bitmap: Vec<u8>,
    after_index: Option<Vec<u8>>,
    pub selection: Selection,
}

impl Plan {
    pub fn prepare(root: &Path, identity: &str, head_only: bool, force: bool) -> io::Result<Self> {
        let (scope, name) = identity
            .split_once('/')
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("reset identity"))?;
        let before_bitmap = fs::read(root.join(".bitmap"))?;
        let mut bitmap = crate::recovery::jsonc::parse(&before_bitmap)?;
        let entries = bitmap.as_object_mut().ok_or_else(|| invalid("reset bitmap"))?;
        if entries.contains_key("_bit_lane") {
            return Err(invalid("reset active lane"));
        }
        if entries
            .get("$schema-version")
            .and_then(Value::as_str)
            .is_none()
        {
            return Err(invalid("reset bitmap schema"));
        }
        let mut bitmap_key = None;
        for (key, row) in entries.iter() {
            if key.starts_with('$') || !row.is_object() {
                continue;
            }
            let row_scope = row["scope"]
                .as_str()
                .filter(|value| !value.is_empty())
                .or_else(|| row["defaultScope"].as_str());
            if row_scope == Some(scope)
                && row["name"] == name
                && bitmap_key.replace(key.clone()).is_some()
            {
                return Err(invalid("reset ambiguous bitmap identity"));
            }
        }
        let bitmap_key = bitmap_key.ok_or_else(|| invalid("reset bitmap identity absent"))?;
        let before_index = fs::read(root.join(".bit/index.json"))?;
        let mut index: Value = serde_json::from_slice(&before_index)?;
        let components =
            index["components"].as_array_mut().ok_or_else(|| invalid("reset index components"))?;
        let positions: Vec<_> = components
            .iter()
            .enumerate()
            .filter_map(|(position, row)| {
                (row["id"]["scope"] == scope && row["id"]["name"] == name).then_some(position)
            })
            .collect();
        if positions.len() != 1 {
            return Err(invalid("reset indexed Component absent or ambiguous"));
        }
        let position = positions[0];
        let model_hash = components[position]["hash"]
            .as_str()
            .ok_or_else(|| invalid("reset index hash"))?
            .to_owned();
        crate::merge_history::hash(&model_hash)?;
        let model_path = object_path(root, &model_hash);
        let before_model = fs::read(&model_path)?;
        let objects = root.join(".bit/objects");
        let model_value = model::read_object(&objects, &model_hash, "Component")?;
        if model_value["scope"] != scope || model_value["name"] != name {
            return Err(invalid("reset Component identity"));
        }
        if (model_value.get("detachedHeads").is_some() && !head_only)
            || model_value.get("orphanedVersions").is_some()
        {
            return Err(invalid("reset detached or orphaned history"));
        }
        let selection = select(&model_value, &objects, head_only)?;
        if let Some(detached) = model_value["detachedHeads"]["heads"].as_array()
            && detached
                .iter()
                .any(|hash| {
                    selection.removed
                        .iter()
                        .any(|removed| hash == removed)
                })
        {
            return Err(invalid("reset selected detached head"));
        }
        if !force {
            validate_dependents(&objects, components, identity, &selection, &model_value)?;
        }
        let updated = selection.updated_model(&model_value)?;
        let next_version = selection.next_head
            .as_deref()
            .map_or_else(String::new, |hash| {
                updated
                    .as_ref()
                    .and_then(|model| model["versions"].as_object())
                    .and_then(|versions| {
                        versions
                            .iter()
                            .find_map(|(label, value)| {
                                (value.as_str() == Some(hash)).then_some(label.clone())
                            })
                    })
                    .unwrap_or_else(|| hash.to_owned())
            });
        let entry =
            bitmap[&bitmap_key].as_object_mut().ok_or_else(|| invalid("reset bitmap row"))?;
        entry.insert("version".into(), Value::String(next_version));
        entry.shift_remove("nextVersion");
        let after_bitmap = crate::inspection::render_bitmap(&bitmap)?;
        let (after_model, after_index) = if let Some(updated) = updated {
            (Some(model::encode(&model_hash, "Component", &updated)?), None)
        } else {
            components.remove(position);
            let mut bytes = serde_json::to_vec_pretty(&index)?;
            bytes.push(b'\n');
            (None, Some(bytes))
        };
        Ok(Self {
            root: root.to_owned(),
            identity: identity.to_owned(),
            head_only,
            force,
            model_hash,
            before_model,
            before_bitmap,
            before_index,
            after_model,
            after_bitmap,
            after_index,
            selection,
        })
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        if file_id.len() > 32
            || file_id.split('-').count() != 6
            || file_id
                .split('-')
                .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
        {
            return Err(invalid("reset bitmap history receipt"));
        }
        let current = Self::prepare(&self.root, &self.identity, self.head_only, self.force)?;
        if current.before_model != self.before_model
            || current.before_bitmap != self.before_bitmap
            || current.before_index != self.before_index
            || current.after_model != self.after_model
            || current.after_bitmap != self.after_bitmap
            || current.after_index != self.after_index
        {
            return Err(invalid("reset workspace changed during preparation"));
        }
        let path = object_path(&self.root, &self.model_hash);
        if let Some(bytes) = &self.after_model {
            fs::write(path, bytes)?;
        } else {
            fs::remove_file(path)?;
        }
        if let Some(bytes) = &self.after_index {
            fs::write(self.root.join(".bit/index.json"), bytes)?;
        }
        let history = self.root.join(".bit/bitmap-history");
        fs::create_dir_all(&history)?;
        fs::copy(self.root.join(".bitmap"), history.join(format!(".bitmap-{file_id}")))?;
        let mut metadata = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.root.join(".bit/bitmap-history-metadata.txt"))?;
        writeln!(metadata, "{file_id} reset")?;
        fs::write(self.root.join(".bitmap"), &self.after_bitmap)
    }
}

fn object_path(root: &Path, hash: &str) -> PathBuf {
    root.join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..])
}

fn validate_dependents(
    objects: &Path,
    components: &[Value],
    identity: &str,
    selection: &Selection,
    selected_model: &Value,
) -> io::Result<()> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("reset identity"))?;
    let removed: HashSet<&str> = selection.removed
        .iter()
        .chain(&selection.labels)
        .map(String::as_str)
        .collect();
    for component in components {
        let hash =
            component["hash"].as_str().ok_or_else(|| invalid("reset dependent index hash"))?;
        let model_value = if component["id"]["scope"] == scope && component["id"]["name"] == name {
            selected_model.clone()
        } else {
            model::read_object(objects, hash, "Component")?
        };
        let versions = model_value["versions"]
            .as_object()
            .ok_or_else(|| invalid("reset dependent versions"))?;
        let mut refs = HashSet::new();
        for hash in versions.values().filter_map(Value::as_str) {
            refs.insert(hash);
        }
        if let Some(head) = model_value["head"].as_str() {
            refs.insert(head);
        }
        if let Some(local) = model_value["state"]["versions"].as_object() {
            for label in local.keys() {
                if crate::merge_history::hash(label).is_ok() {
                    refs.insert(label);
                }
            }
        }
        for reference in refs {
            if component["id"]["scope"] == scope
                && component["id"]["name"] == name
                && removed.contains(reference)
            {
                continue;
            }
            let version = model::read_object(objects, reference, "Version")?;
            for field in
                ["dependencies", "devDependencies", "peerDependencies", "extensionDependencies"]
            {
                if let Some(dependencies) = version[field].as_array() {
                    for dependency in dependencies {
                        let id = &dependency["id"];
                        if id["scope"] == scope
                            && id["name"] == name
                            && id["version"]
                                .as_str()
                                .is_some_and(|version| removed.contains(version))
                        {
                            return Err(invalid("reset version has a dependent"));
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

/// The local refs to remove, their user-facing labels, and the surviving head.
pub struct Selection {
    pub removed: Vec<String>,
    pub labels: Vec<String>,
    pub next_head: Option<String>,
}

impl Selection {
    /// The Component object after Node's `removeVersion` and head update. A
    /// component without a surviving version/head is removed from the index.
    pub fn updated_model(&self, original: &Value) -> io::Result<Option<Value>> {
        let mut model = original.clone();
        let versions =
            model["versions"].as_object_mut().ok_or_else(|| invalid("reset versions map"))?;
        for label in &self.labels {
            versions.shift_remove(label);
        }
        let state = model["state"]["versions"]
            .as_object_mut()
            .ok_or_else(|| invalid("reset local versions map"))?;
        for label in &self.labels {
            state.shift_remove(label);
        }
        let fields = model.as_object_mut().ok_or_else(|| invalid("reset Component object"))?;
        if let Some(head) = &self.next_head {
            fields.insert("head".into(), Value::String(head.clone()));
        } else {
            fields.shift_remove("head");
        }
        if model["versions"].as_object().is_some_and(serde_json::Map::is_empty)
            && self.next_head.is_none()
        {
            return Ok(None);
        }
        Ok(Some(model))
    }
}

/// Select only a linear, local main-lane chain. More complex histories stay
/// with the TypeScript path until they can be published as one operation.
pub fn select(model_value: &Value, objects: &Path, head_only: bool) -> io::Result<Selection> {
    let versions =
        model_value["versions"].as_object().ok_or_else(|| invalid("reset versions map"))?;
    let state = model_value["state"]["versions"]
        .as_object()
        .ok_or_else(|| invalid("reset local versions map"))?;
    let head = model_value["head"].as_str().ok_or_else(|| invalid("reset head absent"))?;
    crate::merge_history::hash(head)?;
    let mut local = HashMap::new();
    for (label, row) in state {
        if row["local"] != true {
            continue;
        }
        let hash = match versions.get(label).and_then(Value::as_str) {
            Some(hash) => hash,
            None => label,
        };
        crate::merge_history::hash(hash)?;
        if local.insert(hash.to_owned(), label.to_owned()).is_some() {
            return Err(invalid("reset duplicate local hash"));
        }
    }
    if !local.contains_key(head) {
        return Err(invalid("reset head is exported"));
    }
    let mut current = head.to_owned();
    let mut removed = Vec::new();
    let mut seen = HashSet::new();
    let next_head = loop {
        if !seen.insert(current.clone()) || seen.len() > 4096 {
            return Err(invalid("reset cyclic or oversized local history"));
        }
        removed.push(current.clone());
        let version = model::read_object(objects, &current, "Version")?;
        let parents =
            version["parents"].as_array().ok_or_else(|| invalid("reset Version parents"))?;
        let parent = match parents.as_slice() {
            [] => None,
            [parent] => {
                let parent = parent.as_str().ok_or_else(|| invalid("reset parent ref"))?;
                crate::merge_history::hash(parent)?;
                Some(parent.to_owned())
            }
            _ => return Err(invalid("reset merge-parent Version")),
        };
        if head_only
            || parent
                .as_ref()
                .is_none_or(|parent| !local.contains_key(parent))
        {
            break parent;
        }
        current = parent.ok_or_else(|| invalid("reset parent absent"))?;
    };
    if !head_only && removed.len() != local.len() {
        return Err(invalid("reset detached local heads"));
    }
    let selected = removed.iter().collect::<HashSet<_>>();
    let labels = state
        .iter()
        .filter_map(|(label, row)| {
            if row["local"] != true {
                return None;
            }
            let hash = versions
                .get(label)
                .and_then(Value::as_str)
                .unwrap_or(label);
            selected
                .contains(&hash.to_owned())
                .then_some(label.clone())
        })
        .collect();
    Ok(Selection { removed, labels, next_head })
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
