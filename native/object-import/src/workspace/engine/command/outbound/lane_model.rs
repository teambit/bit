//! Freeze the ordinary current lane, its component models, and the local
//! Version closure before the export transaction starts.
use super::{Prepare, invalid, model, remote};
use crate::transfer;
use bit_client_transfer::tar::ObjectItem;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_OBJECTS: usize = 4096;

pub(super) struct LaneSelected {
    pub(super) scope: String,
    pub(super) name: String,
    pub(super) hashes: LaneHashes,
    pub(super) lane: Value,
    pub(super) objects: Vec<ObjectItem>,
    pub(super) component_ids: Vec<String>,
    pub(super) expected_ids: Vec<String>,
    pub(super) models: Vec<model::ModelBytes>,
}

pub(super) struct LaneHashes {
    pub(super) lane: String,
    pub(super) history: String,
}

pub(super) fn select(input: &Prepare) -> io::Result<Option<LaneSelected>> {
    let Some((scope, name)) = current_identity(input)? else {
        return Ok(None);
    };
    let loaded = load_lane(input, &scope, &name)?;
    let mut selected = select_components(input, &scope, &name, &loaded)?;
    for hash in [&loaded.history_hash, &loaded.hash] {
        selected.append(ObjectItem {
            hash: hash.clone(),
            compressed: read_compressed(&loaded.dir, hash)?,
            scope: None,
        })?;
    }
    Ok(Some(LaneSelected {
        scope,
        name,
        hashes: LaneHashes { lane: loaded.hash, history: loaded.history_hash },
        lane: loaded.lane,
        objects: selected.objects,
        component_ids: selected.component_ids,
        expected_ids: selected.expected_ids,
        models: selected.models,
    }))
}

fn current_identity(input: &Prepare) -> io::Result<Option<(String, String)>> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(input.root.join(".bitmap"))?)?;
    let Some(current) = bitmap.get("_bit_lane") else {
        return Ok(None);
    };
    if !input.ids.is_empty() || input.options.resume.is_some() {
        return Err(invalid("outbound lane explicit ids or resume"));
    }
    let scope = current["id"]["scope"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("outbound lane scope"))?
        .to_owned();
    let name = current["id"]["name"]
        .as_str()
        .filter(|value| !value.is_empty() && *value != "main")
        .ok_or_else(|| invalid("outbound lane name"))?
        .to_owned();
    Ok(Some((scope, name)))
}

struct Loaded {
    index: Value,
    lane: Value,
    hash: String,
    history_hash: String,
    dir: PathBuf,
}

fn load_lane(input: &Prepare, scope: &str, name: &str) -> io::Result<Loaded> {
    let index: Value = serde_json::from_slice(&fs::read(input.root.join(".bit/index.json"))?)?;
    let lane_row = index["lanes"]
        .as_array()
        .ok_or_else(|| invalid("outbound lane index"))?
        .iter()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        .ok_or_else(|| invalid("outbound current lane missing"))?;
    let hash = lane_row["hash"]
        .as_str()
        .ok_or_else(|| invalid("outbound lane hash"))?
        .to_owned();
    let dir = input.root.join(".bit/objects");
    let lane = model::read_object(&dir, &hash, "Lane")?;
    if lane["scope"] != scope || lane["name"] != name {
        return Err(invalid("outbound lane identity"));
    }
    if let Some(parent) = lane
        .get("forkedFrom")
        .filter(|value| !value.is_null())
        && (parent["scope"] != scope || parent["name"].as_str().is_none_or(str::is_empty))
    {
        return Err(invalid("outbound cross-scope lane fork"));
    }
    if lane
        .get("readmeComponent")
        .is_some_and(|value| !value.is_null())
    {
        return Err(invalid("outbound complex lane export"));
    }
    let history_hash =
        crate::validate::hexadecimal(&Sha1::digest(format!("{hash}:LaneHistory").as_bytes()));
    let history = model::read_object(&dir, &history_hash, "LaneHistory")?;
    if history["scope"] != scope || history["name"] != name || history["laneHash"] != hash {
        return Err(invalid("outbound LaneHistory identity"));
    }
    Ok(Loaded { index, lane, hash, history_hash, dir })
}

struct Selection {
    objects: Vec<ObjectItem>,
    seen: HashSet<String>,
    budget: usize,
    component_ids: Vec<String>,
    expected_ids: Vec<String>,
    models: Vec<model::ModelBytes>,
}

impl Selection {
    fn new() -> Self {
        Self {
            objects: Vec::new(),
            seen: HashSet::new(),
            budget: 0,
            component_ids: Vec::new(),
            expected_ids: Vec::new(),
            models: Vec::new(),
        }
    }
    fn append(&mut self, item: ObjectItem) -> io::Result<()> {
        if !self.seen.insert(item.hash.clone()) {
            return Ok(());
        }
        self.budget = self.budget
            .checked_add(item.compressed.len())
            .ok_or_else(|| invalid("outbound object budget"))?;
        if self.budget > MAX_BYTES || self.objects.len() >= MAX_OBJECTS {
            return Err(invalid("outbound object budget"));
        }
        self.objects.push(item);
        Ok(())
    }
}

fn select_components(
    input: &Prepare,
    scope: &str,
    name: &str,
    loaded: &Loaded,
) -> io::Result<Selection> {
    let rows = lane_entries(&loaded.lane)?;
    if rows.len() > MAX_OBJECTS {
        return Err(invalid("outbound lane component budget"));
    }
    let component_rows =
        loaded.index["components"].as_array().ok_or_else(|| invalid("outbound component index"))?;
    let remote_heads = remote_heads(&input.root, scope, name)?;
    let host = remote::configured_host(input, scope)?;
    let context = ComponentContext { input, loaded, scope, name, host: &host };
    let mut seen_ids = HashSet::new();
    let mut selected = Selection::new();
    for entry in &rows {
        let component = ComponentId::parse(entry)?;
        if !seen_ids.insert(component.id.clone()) {
            return Err(invalid("outbound duplicate lane component"));
        }
        let previous_head = remote_heads
            .iter()
            .find(|row| component.matches(row))
            .and_then(|row| row["head"].as_str());
        if previous_head == Some(component.head) {
            continue;
        }
        let row = component_rows
            .iter()
            .find(|row| component.matches(row))
            .ok_or_else(|| invalid("outbound lane component model missing"))?;
        select_component(&context, &component, row, previous_head, &mut selected)?;
    }
    Ok(selected)
}

pub(super) fn lane_entries(lane: &Value) -> io::Result<Vec<Value>> {
    let mut entries = lane["components"]
        .as_array()
        .ok_or_else(|| invalid("outbound lane components"))?
        .clone();
    let updates = match lane.get("updateDependents") {
        None | Some(Value::Null) => &[][..],
        Some(Value::Array(updates)) => updates.as_slice(),
        Some(_) => return Err(invalid("outbound lane update-dependents")),
    };
    for update in updates {
        let id = update.as_str().ok_or_else(|| invalid("outbound lane update-dependent"))?;
        let (identity, head) =
            id.rsplit_once('@').ok_or_else(|| invalid("outbound lane update-dependent id"))?;
        let (scope, name) = identity
            .split_once('/')
            .ok_or_else(|| invalid("outbound lane update-dependent identity"))?;
        crate::merge_history::hash(head)?;
        if scope.is_empty() || name.is_empty() {
            return Err(invalid("outbound lane update-dependent identity"));
        }
        entries.push(json!({"id":{"scope":scope,"name":name},"head":head}));
    }
    Ok(entries)
}

struct ComponentId<'a> {
    scope: &'a str,
    name: &'a str,
    head: &'a str,
    id: String,
}

impl<'a> ComponentId<'a> {
    fn parse(entry: &'a Value) -> io::Result<Self> {
        let scope = entry["id"]["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("outbound lane component scope"))?;
        let name = entry["id"]["name"]
            .as_str()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("outbound lane component name"))?;
        let head = entry["head"].as_str().ok_or_else(|| invalid("outbound lane head"))?;
        crate::merge_history::hash(head)?;
        Ok(Self { scope, name, head, id: format!("{scope}/{name}") })
    }
    fn matches(&self, row: &Value) -> bool {
        row["id"]["scope"] == self.scope && row["id"]["name"] == self.name
    }
}

struct ComponentContext<'a> {
    input: &'a Prepare,
    loaded: &'a Loaded,
    scope: &'a str,
    name: &'a str,
    host: &'a str,
}

fn select_component(
    context: &ComponentContext<'_>,
    id: &ComponentId<'_>,
    row: &Value,
    previous_head: Option<&str>,
    selected: &mut Selection,
) -> io::Result<()> {
    let hash = row["hash"].as_str().ok_or_else(|| invalid("outbound component model hash"))?;
    let dir = &context.loaded.dir;
    let mut component = model::read_object(dir, hash, "Component")?;
    if component["scope"] != id.scope || component["name"] != id.name {
        return Err(invalid("outbound component identity"));
    }
    let before = read_compressed(dir, hash)?;
    model::clear_and_mark_exported(
        &mut component,
        context.scope,
        context.host,
        &context.input.transport.export_date,
    )?;
    let after = model::encode(hash, "Component", &component)?;
    let versions = lane_versions(dir, id.head, previous_head, context.scope, context.name)?;
    selected.expected_ids.extend(
        versions
            .iter()
            .map(|version| format!("{}@{version}", id.id)),
    );
    for object in model::collect(dir, hash, &after, &versions)? {
        selected.append(object)?;
    }
    selected.models.push(model::ModelBytes { hash: hash.to_owned(), before, after });
    selected.component_ids.push(id.id.clone());
    Ok(())
}

fn remote_heads(root: &Path, scope: &str, name: &str) -> io::Result<Vec<Value>> {
    if scope.contains('/') || name.contains('/') || scope == ".." || name == ".." {
        return Err(invalid("outbound lane ref path"));
    }
    let path = root
        .join(".bit/refs/remotes")
        .join(scope)
        .join(name);
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

fn read_compressed(dir: &Path, hash: &str) -> io::Result<Vec<u8>> {
    transfer::object::repository(dir, crate::merge_history::hash(hash)?, MAX_BYTES)
}

/// Keep the lane head and any preceding snaps made on this lane. A main-lane
/// parent is already on the component's home scope and does not need sending.
fn lane_versions(
    dir: &Path,
    head: &str,
    previous_head: Option<&str>,
    scope: &str,
    name: &str,
) -> io::Result<Vec<String>> {
    let mut output = Vec::new();
    let mut pending = vec![head.to_owned()];
    let mut seen = HashSet::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) || Some(hash.as_str()) == previous_head {
            continue;
        }
        if seen.len() > MAX_OBJECTS {
            return Err(invalid("outbound lane version budget"));
        }
        if let Some(parents) = selected_parents(dir, &hash, head, scope, name)? {
            output.push(hash);
            pending.extend(parents.into_iter().rev());
        }
    }
    output.reverse();
    Ok(output)
}

fn selected_parents(
    dir: &Path,
    hash: &str,
    head: &str,
    scope: &str,
    name: &str,
) -> io::Result<Option<Vec<String>>> {
    let version = model::read_object(dir, hash, "Version")?;
    if version["unrelated"] == true || version["squashed"] == true {
        return Err(invalid("outbound rewritten lane history"));
    }
    let origin = &version["origin"]["lane"];
    if hash != head && (origin["scope"] != scope || origin["name"] != name) {
        return Ok(None);
    }
    let parents = version["parents"].as_array().ok_or_else(|| invalid("outbound lane parents"))?;
    parents
        .iter()
        .map(|parent| {
            let hash = parent.as_str().ok_or_else(|| invalid("outbound lane parent"))?;
            crate::merge_history::hash(hash)?;
            Ok(hash.to_owned())
        })
        .collect::<io::Result<Vec<_>>>()
        .map(Some)
}

#[cfg(test)]
mod tests;
