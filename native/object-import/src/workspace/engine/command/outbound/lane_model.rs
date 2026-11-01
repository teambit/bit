//! Freeze the ordinary current lane, its component models, and the local
//! `Version` closure before the export transaction starts.
pub(super) use self::exhaustive::lane_entries;
mod exhaustive;
mod hidden;
mod readme;
mod staged;
#[cfg(test)]
mod tests;
use super::{
    super::inbound::remote::file_list::{row_lane_matches, row_scoped_id_parts},
    Prepare, invalid, model, remote,
};
use crate::transfer;
use bit_client_transfer::tar::ObjectItem;
use serde_json::Value;
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

#[derive(Debug, Clone, PartialEq, Eq)]
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
    let Some((scope, name)) = current_identity(input)? else { return Ok(None) };
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
                .filter(|id| id.split('/').next() != Some(scope.as_str()))
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
    let Some(current) = bitmap.get("_bit_lane") else { return Ok(None) };
    if !input.ids.is_empty() {
        return Err(invalid("outbound explicit lane IDs require canonical stack"));
    }
    row_scoped_id_parts(current)
        .filter(|(_, name)| *name != "main")
        .map(|(scope, name)| Some((scope.to_owned(), name.to_owned())))
        .ok_or_else(|| invalid("outbound lane identity"))
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
        crate::parse_jsonc(&fs::read(crate::scope_path(&input.root).join("index.json"))?)?;
    let lanes = index["lanes"].as_array().ok_or_else(|| invalid("outbound lane index"))?;
    let lane_row = lanes
        .iter()
        .find(|row| row_lane_matches(row, scope, name))
        .ok_or_else(|| invalid("outbound current lane missing"))?;
    let hash_str = lane_row["hash"].as_str().ok_or_else(|| invalid("outbound lane hash"))?;
    let hash = hash_str.trim().to_owned();
    let dir = crate::scope_path(&input.root).join("objects");
    let lane = model::read_object(&dir, &hash, "Lane")?;
    if lane["scope"].as_str().map(str::trim) != Some(scope)
        || lane["name"].as_str().map(str::trim) != Some(name)
    {
        return Err(invalid("outbound lane identity"));
    }
    let forked_from = forked_from(&lane, scope, input.options.fork_lane_new_scope)?;
    readme::validate(&lane, name)?;
    let history_hash =
        crate::validate::hexadecimal(&Sha1::digest(format!("{hash}:LaneHistory").as_bytes()));
    let history = model::read_object(&dir, &history_hash, "LaneHistory")?;
    if history["laneHash"].as_str().map(str::trim) != Some(hash.as_str()) {
        return Err(invalid("outbound LaneHistory identity"));
    }
    Ok(Loaded { index, lane, hash, history_hash, dir, forked_from })
}

fn forked_from(lane: &Value, scope: &str, new_scope: bool) -> io::Result<Option<(String, String)>> {
    let forked_from = lane
        .get("forkedFrom")
        .filter(|value| !value.is_null())
        .map(|parent| {
            parent
                .as_str()
                .and_then(|raw| raw.trim().split_once('/'))
                .or_else(|| Some((parent["scope"].as_str()?, parent["name"].as_str()?)))
                .map(|(sc, nm)| (sc.trim(), nm.trim()))
                .filter(|(sc, nm)| !sc.is_empty() && !nm.is_empty())
                .map(|(sc, nm)| (sc.to_owned(), nm.to_owned()))
                .ok_or_else(|| invalid("outbound lane fork identity"))
        })
        .transpose()?;
    (forked_from
        .as_ref()
        .is_some_and(|(sc, _)| sc != scope)
        == new_scope)
        .then_some(forked_from)
        .ok_or_else(|| invalid("outbound cross-scope lane fork flag"))
}

#[derive(Default)]
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
    let mut selected = Selection::default();
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
            .find(|row| row["isSymlink"] != true && component.matches(row))
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
            Some((sc, nm)) => remote_heads(&input.root, sc, nm)?,
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
        let head_in = |rows: &'a [Value]| {
            rows.iter()
                .find(|row| component.matches(row))
                .and_then(|row| row["head"].as_str())
                .map(str::trim)
                .filter(|hd| !hd.is_empty())
        };
        let (lane_remote_head, fork_remote_head) = (head_in(&self.lane), head_in(&self.fork));
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
        rows.extend(exhaustive::workspace_entries(input, loaded, &rows)?);
    }
    (rows.len() <= MAX_OBJECTS)
        .then_some((rows, exhaustive))
        .ok_or_else(|| invalid("outbound lane component budget"))
}

struct ComponentId<'a> {
    scope: &'a str,
    name: &'a str,
    head: &'a str,
    id: String,
}

impl<'a> ComponentId<'a> {
    fn parse(entry: &'a Value) -> io::Result<Self> {
        let field = |key: &str| {
            entry["id"][key]
                .as_str()
                .or_else(|| entry[key].as_str())
                .map(str::trim)
        };
        let (scope, name) = if let Some(raw) = entry["id"].as_str().map(str::trim) {
            raw.rsplit_once('@')
                .map_or(raw, |(bare, _)| bare.trim())
                .split_once('/')
                .map(|(sc, nm)| (sc.trim(), nm.trim()))
                .ok_or_else(|| invalid("outbound lane component scope"))?
        } else {
            let scope = field("scope").ok_or_else(|| invalid("outbound lane component scope"))?;
            let name = field("name").ok_or_else(|| invalid("outbound lane component name"))?;
            (scope, name)
        };
        let head = entry["head"]
            .as_str()
            .or_else(|| entry["version"].as_str())
            .map(str::trim)
            .ok_or_else(|| invalid("outbound lane head"))?;
        crate::merge_history::hash(head)?;
        if scope.is_empty() || name.is_empty() {
            return Err(invalid("outbound lane component name"));
        }
        Ok(Self { scope, name, head, id: format!("{scope}/{name}") })
    }
    #[inline]
    fn matches(&self, row: &Value) -> bool {
        row_lane_matches(row, self.scope, self.name)
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
    let hash = row["hash"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("outbound component model hash"))?;
    let mut component = model::read_object(&context.loaded.dir, hash, "Component")?;
    if component["scope"].as_str().map(str::trim) != Some(id.scope)
        || component["name"].as_str().map(str::trim) != Some(id.name)
    {
        return Err(invalid("outbound component identity"));
    }
    staged::check_new_cross_scope_conflict(context, id, &component)?;
    let before = read_compressed(&context.loaded.dir, hash)?;
    model::clear_and_mark_exported(
        &mut component,
        context.scope,
        context.host,
        &context.input.transport.export_date,
    )?;
    let after = model::encode(hash, "Component", &component)?;
    let versions = staged::selected_versions(context, id, &component, previous_head, exhaustive)?;
    record_selected_component(context, id, hash, &versions, before, after, selected)
}

fn record_selected_component(
    context: &ComponentContext<'_>,
    id: &ComponentId<'_>,
    hash: &str,
    versions: &[String],
    before: Vec<u8>,
    after: Vec<u8>,
    selected: &mut Selection,
) -> io::Result<()> {
    let history = model::prepare_history(&context.loaded.dir, id.scope, id.name, id.head)?;
    let mut expected = HashSet::with_capacity(versions.len() + history.hashes.len());
    for version in versions.iter().chain(&history.hashes) {
        if expected.insert(version.as_str()) {
            selected.expected_ids.push(format!("{}@{version}", id.id));
        }
    }
    selected.histories.push(history);
    let ignore = context.input.options.ignore_missing_artifacts;
    for object in model::collect(&context.loaded.dir, hash, &after, versions, ignore)? {
        selected.append(object)?;
    }
    selected.models.push(model::ModelBytes { hash: hash.to_owned(), before, after });
    selected.component_ids.push(id.id.clone());
    Ok(())
}

fn remote_heads(root: &Path, scope: &str, name: &str) -> io::Result<Vec<Value>> {
    let (scope, name) = (scope.trim(), name.trim());
    let bad =
        |seg: &str| seg.is_empty() || matches!(seg, "." | "..") || seg.contains(['/', '\\', '\0']);
    if bad(scope) || bad(name) {
        return Err(invalid("outbound lane ref path"));
    }
    match fs::read(crate::scope_path(root).join(format!("refs/remotes/{scope}/{name}"))) {
        Ok(bytes) => serde_json::from_value(crate::parse_jsonc(&bytes)?).map_err(io::Error::other),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

#[inline]
fn read_compressed(dir: &Path, hash: &str) -> io::Result<Vec<u8>> {
    transfer::object::repository(dir, crate::merge_history::hash(hash)?, MAX_BYTES)
}
