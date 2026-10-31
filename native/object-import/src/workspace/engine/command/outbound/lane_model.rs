//! Freeze the ordinary current lane, its component models, and the local
//! Version closure before the export transaction starts.
use super::{Prepare, invalid, model, remote};
mod exhaustive;
mod hidden;
mod readme;
mod staged;
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
    pub(super) local_lane_after: Option<Vec<u8>>,
    pub(super) components: SelectedComponents,
    pub(super) fork_history: Option<ForkHistory>,
}

pub(super) struct SelectedComponents {
    pub(super) objects: Vec<ObjectItem>,
    pub(super) ids: Vec<String>,
    pub(super) expected_ids: Vec<String>,
    pub(super) models: Vec<model::ModelBytes>,
    pub(super) histories: Vec<model::HistoryBytes>,
}

#[derive(Clone)]
pub(super) struct ForkHistory {
    pub(super) parent: String,
    pub(super) external_count: usize,
    pub(super) candidate_count: usize,
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
    let candidate_count = lane_entries(&loaded.lane)?.len();
    let fork_history = loaded.forked_from
        .as_ref()
        .filter(|(parent_scope, _)| *parent_scope != scope)
        .map(|(parent_scope, parent_name)| ForkHistory {
            parent: format!("{parent_scope}/{parent_name}"),
            external_count: selected.component_ids
                .iter()
                .filter(|id| !id.starts_with(&format!("{scope}/")))
                .count(),
            candidate_count,
        });
    let (lane, local_lane_after) = hidden::append(input, &loaded, &scope, &name, &mut selected)?;
    Ok(Some(LaneSelected {
        scope,
        name,
        local_lane_after,
        hashes: LaneHashes { lane: loaded.hash, history: loaded.history_hash },
        lane,
        components: SelectedComponents {
            objects: selected.objects,
            ids: selected.component_ids,
            expected_ids: selected.expected_ids,
            models: selected.models,
            histories: selected.histories,
        },
        fork_history,
    }))
}

fn current_identity(input: &Prepare) -> io::Result<Option<(String, String)>> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(input.root.join(".bitmap"))?)?;
    let Some(current) = bitmap.get("_bit_lane") else {
        return Ok(None);
    };
    if !input.ids.is_empty() {
        return Err(invalid("outbound explicit lane IDs require canonical stack"));
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
    forked_from: Option<(String, String)>,
}

fn load_lane(input: &Prepare, scope: &str, name: &str) -> io::Result<Loaded> {
    let index: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(&input.root).join("index.json"))?)?;
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
    let dir = crate::scope_path(&input.root).join("objects");
    let lane = model::read_object(&dir, &hash, "Lane")?;
    if lane["scope"] != scope || lane["name"] != name {
        return Err(invalid("outbound lane identity"));
    }
    let forked_from = forked_from(&lane, scope, input.options.fork_lane_new_scope)?;
    readme::validate(&lane, name)?;
    let history_hash =
        crate::validate::hexadecimal(&Sha1::digest(format!("{hash}:LaneHistory").as_bytes()));
    let history = model::read_object(&dir, &history_hash, "LaneHistory")?;
    // LaneHistory keeps its original name/scope after a local rename or scope change.
    if history["laneHash"] != hash {
        return Err(invalid("outbound LaneHistory identity"));
    }
    Ok(Loaded { index, lane, hash, history_hash, dir, forked_from })
}

fn forked_from(lane: &Value, scope: &str, new_scope: bool) -> io::Result<Option<(String, String)>> {
    let forked_from = lane
        .get("forkedFrom")
        .filter(|value| !value.is_null())
        .map(|parent| {
            let parent_scope = parent["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty());
            let parent_name = parent["name"]
                .as_str()
                .filter(|name| !name.is_empty());
            parent_scope
                .zip(parent_name)
                .map(|(scope, name)| (scope.to_owned(), name.to_owned()))
                .ok_or_else(|| invalid("outbound lane fork identity"))
        })
        .transpose()?;
    let cross_scope = forked_from
        .as_ref()
        .is_some_and(|(parent_scope, _)| parent_scope != scope);
    if cross_scope != new_scope {
        return Err(invalid("outbound cross-scope lane fork flag"));
    }
    Ok(forked_from)
}

struct Selection {
    objects: Vec<ObjectItem>,
    seen: HashSet<String>,
    budget: usize,
    component_ids: Vec<String>,
    expected_ids: Vec<String>,
    models: Vec<model::ModelBytes>,
    histories: Vec<model::HistoryBytes>,
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
            histories: Vec::new(),
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
    let (rows, exhaustive) = selection_rows(input, loaded)?;
    let component_rows = loaded.index["components"]
        .as_array()
        .or_else(|| loaded.index.as_array())
        .ok_or_else(|| invalid("outbound component index"))?;
    let heads = RemoteLaneHeads::load(input, loaded, scope, name)?;
    let host = remote::configured_host(input, scope)?;
    let context = ComponentContext { input, loaded, scope, name, host: &host };
    let mut seen_ids = HashSet::new();
    let mut selected = Selection::new();
    for entry in &rows {
        let component = ComponentId::parse(entry)?;
        if !seen_ids.insert(component.id.clone()) {
            return Err(invalid("outbound duplicate lane component"));
        }
        let Some(previous_head) = heads.should_select(&context, &component, exhaustive)? else {
            continue;
        };
        let row = component_rows
            .iter()
            .find(|row| component.matches(row))
            .ok_or_else(|| invalid("outbound lane component model missing"))?;
        select_component(&context, &component, row, previous_head, exhaustive, &mut selected)?;
    }
    Ok(selected)
}

struct RemoteLaneHeads {
    lane: Vec<Value>,
    fork: Vec<Value>,
}

impl RemoteLaneHeads {
    fn load(input: &Prepare, loaded: &Loaded, scope: &str, name: &str) -> io::Result<Self> {
        let lane = remote_heads(&input.root, scope, name)?;
        let fork = match &loaded.forked_from {
            Some((parent_scope, parent_name)) => {
                remote_heads(&input.root, parent_scope, parent_name)?
            }
            None => Vec::new(),
        };
        Ok(Self { lane, fork })
    }

    fn should_select<'a>(
        &'a self,
        context: &ComponentContext<'_>,
        component: &ComponentId<'_>,
        exhaustive: bool,
    ) -> io::Result<Option<Option<&'a str>>> {
        let lane_remote_head = self.lane
            .iter()
            .find(|row| component.matches(row))
            .and_then(|row| row["head"].as_str());
        let fork_remote_head = self.fork
            .iter()
            .find(|row| component.matches(row))
            .and_then(|row| row["head"].as_str());
        if (!exhaustive || context.input.options.head_only)
            && lane_remote_head == Some(component.head)
            && !(context.input.options.fork_lane_new_scope
                && staged::missing_remote_head(context.host, component.head)?)
        {
            return Ok(None);
        }
        Ok(Some(lane_remote_head.or(fork_remote_head)))
    }
}

fn selection_rows(input: &Prepare, loaded: &Loaded) -> io::Result<(Vec<Value>, bool)> {
    let mut rows = lane_entries(&loaded.lane)?;
    let exhaustive =
        input.options.all || input.options.all_versions || input.options.head_only;
    if exhaustive || input.options.fork_lane_new_scope {
        let extra = exhaustive::workspace_entries(input, loaded, &rows)?;
        rows.extend(extra);
    }
    if rows.len() > MAX_OBJECTS {
        return Err(invalid("outbound lane component budget"));
    }
    Ok((rows, exhaustive))
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
    exhaustive: bool,
    selected: &mut Selection,
) -> io::Result<()> {
    let hash = row["hash"].as_str().ok_or_else(|| invalid("outbound component model hash"))?;
    let dir = &context.loaded.dir;
    let mut component = model::read_object(dir, hash, "Component")?;
    if component["scope"] != id.scope || component["name"] != id.name {
        return Err(invalid("outbound component identity"));
    }
    staged::check_new_cross_scope_conflict(context, id, &component)?;
    let before = read_compressed(dir, hash)?;
    model::clear_and_mark_exported(
        &mut component,
        context.scope,
        context.host,
        &context.input.transport.export_date,
    )?;
    let after = model::encode(hash, "Component", &component)?;
    let versions = staged::selected_versions(context, id, &component, previous_head, exhaustive)?;
    let history = model::prepare_history(dir, id.scope, id.name, id.head)?;
    let mut expected = HashSet::new();
    for version in versions.iter().chain(&history.hashes) {
        if expected.insert(version.clone()) {
            selected.expected_ids.push(format!("{}@{version}", id.id));
        }
    }
    selected.histories.push(history);
    for object in model::collect(
        dir,
        hash,
        &after,
        &versions,
        context.input.options.ignore_missing_artifacts,
    )? {
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
    let path = crate::scope_path(root)
        .join("refs/remotes")
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

#[cfg(test)]
mod tests;
