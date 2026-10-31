//! Public outbound export owner. Prepare captures and validates local objects;
//! Apply transfers compressed objects and owns remote validation/persistence.
//! Finalize publishes local bookkeeping from the retained acknowledgements.
pub(in crate::workspace::engine) use lifecycle::{apply, finalize, stage};
pub(crate) use model::{encode as encode_object, read_object};

mod hub;
mod lane_model;
mod lane_plan;
mod lane_publication;
mod lifecycle;
mod model;
mod packages;
mod publication;
mod publication_state;
mod receipt;
mod remote;

use super::{super::invalid, State};
use bit_client_transfer::tar::ObjectItem;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Candidates {
    root: PathBuf,
    all: bool,
}

pub(in crate::workspace::engine) fn candidates(input: &Candidates) -> io::Result<Value> {
    model::candidates(&input.root, input.all)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    operation: String,
    ids: Vec<String>,
    #[serde(rename = "options")]
    options: Options,
    #[serde(flatten)]
    transport: Transport,
    #[serde(flatten)]
    resolution: hub::Resolution,
    #[serde(default)]
    native_packages: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Transport {
    global_config_dir: PathBuf,
    node_executable: PathBuf,
    bit_version: String,
    client_id: String,
    export_date: String,
    bitmap_history_file_id: String,
    bit_dir: PathBuf,
    #[serde(default)]
    token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    #[serde(rename = "originDirectly")]
    origin_directly: bool,
    #[serde(default)]
    all: bool,
    #[serde(default)]
    all_versions: bool,
    #[serde(default)]
    head_only: bool,
    #[serde(default)]
    fork_lane_new_scope: bool,
    resume: Option<String>,
    #[serde(default)]
    ignore_missing_artifacts: bool,
    #[serde(default)]
    pattern_selection: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Apply {
    token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Finalize {
    token: String,
}

pub(super) struct Retained {
    token: String,
    client_id: String,
    pending: Vec<Pending>,
    resume: Option<ResumeContext>,
    network: NetworkConfig,
    publication: Option<Publication>,
    /// The ids the remotes persisted, once the objects are transferred.
    transfer: Transfer,
    local: LocalPublication,
}

struct LocalPublication {
    selection_history: model::prefilter::Prepared,
    packages: packages::Prepared,
}

#[derive(Default)]
struct Transfer {
    ids: Option<Vec<String>>,
    failed: Option<String>,
    jobs: Vec<String>,
    urls: Vec<String>,
    messages: Vec<String>,
    hub: Option<hub::Plan>,
    progress: Progress,
}

#[derive(Default)]
struct Progress {
    phase: &'static str,
    attempted_scopes: Vec<String>,
    observed: bool,
}

struct Pending {
    scope: String,
    host: String,
    objects: Vec<ObjectItem>,
}

use publication_state::Publication;

struct Plan {
    count: usize,
    resume: Option<ResumeContext>,
    publication: Option<Publication>,
    pending: Vec<Pending>,
    fork_history: Option<lane_model::ForkHistory>,
    selection_history: model::prefilter::Prepared,
}

struct ResumeContext {
    selected: Vec<(String, String, String)>,
}

struct NetworkConfig {
    root: PathBuf,
    node_executable: PathBuf,
    bit_dir: PathBuf,
    bit_version: String,
    auth_token: Option<String>,
    global: bit_client_transfer::GlobalConfig,
}

pub(in crate::workspace::engine) fn prepare(
    input: &Prepare,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    state.outbound = None;
    validate(input)?;
    let plan = match lane_model::select(input)? {
        Some(lane) => lane_plan::prepare(input, lane)?,
        None => plan_main(input)?,
    };
    let packages = packages::prepare(input, &plan)?;
    let hub = hub::plan(input, &plan.pending)?;
    state.sequence =
        state.sequence.checked_add(1).ok_or_else(|| invalid("outbound sequence limit"))?;
    let token = format!("outbound-{}", state.sequence);
    let lane = plan.publication.as_ref().and_then(Publication::lane_name);
    let mut receipt =
        receipt::prepare(&token, plan.count, &plan.pending, lane, plan.fork_history.as_ref());
    receipt["centralHub"] = json!(hub.is_some());
    if let (Some(target), Some(source)) =
        (receipt.as_object_mut(), packages.receipt(None).as_object())
    {
        target.extend(source.clone());
    }
    if input.resolution.preflight() {
        receipt["preflight"] = json!(true);
        return Ok((plan.count, receipt));
    }
    state.outbound = Some(Retained {
        token,
        client_id: input.transport.client_id.clone(),
        pending: plan.pending,
        resume: plan.resume,
        network: network(input)?,
        publication: plan.publication,
        transfer: Transfer { hub, ..Transfer::default() },
        local: LocalPublication { selection_history: plan.selection_history, packages },
    });
    Ok((plan.count, receipt))
}

fn plan_main(input: &Prepare) -> io::Result<Plan> {
    if input.options.fork_lane_new_scope {
        return Err(invalid("outbound fork-lane-new-scope on main"));
    }
    let selected = model::select(input)?;
    let resume = resume_context(input, &selected)?;
    let count = selected.len();
    let hosts = hosts(input, &selected)?;
    let publication = if selected.is_empty() {
        None
    } else {
        Some(Publication::Main(Box::new(publication::prepare(input, &selected, &hosts)?)))
    };
    let pending = batches(selected, &hosts)?;
    Ok(Plan {
        count,
        resume,
        publication,
        pending,
        fork_history: None,
        selection_history: model::selection_history(input)?,
    })
}

/// What a resumed export acknowledges: the selected heads, so each
/// component must have one local version.
fn resume_context(
    input: &Prepare,
    selected: &[model::Selected],
) -> io::Result<Option<ResumeContext>> {
    if input.options.resume.is_none() {
        return Ok(None);
    }
    Ok(Some(ResumeContext {
        selected: selected
            .iter()
            .flat_map(|item| {
                item.labels
                    .iter()
                    .map(|label| (item.scope.clone(), item.name.clone(), label.clone()))
            })
            .collect(),
    }))
}

/// Each selected scope's remote host.
fn hosts(input: &Prepare, selected: &[model::Selected]) -> io::Result<HashMap<String, String>> {
    let mut hosts = HashMap::new();
    for item in selected {
        if !hosts.contains_key(&item.scope) {
            hosts.insert(item.scope.clone(), remote::host(input, &item.scope)?);
        }
    }
    Ok(hosts)
}

/// The selected components grouped by scope, in first-seen order, with
/// their objects.
fn batches(
    selected: Vec<model::Selected>,
    hosts: &HashMap<String, String>,
) -> io::Result<Vec<Pending>> {
    let mut grouped: Vec<(String, Vec<model::Selected>)> = Vec::new();
    for item in selected {
        match grouped
            .iter_mut()
            .find(|(scope, _)| *scope == item.scope)
        {
            Some((_, items)) => items.push(item),
            None => grouped.push((item.scope.clone(), vec![item])),
        }
    }
    grouped
        .into_iter()
        .map(|(scope, selected)| {
            let host = hosts
                .get(&scope)
                .ok_or_else(|| invalid("outbound remote host"))?
                .clone();
            Ok(Pending { host, scope, objects: objects(&selected)? })
        })
        .collect()
}

fn network(input: &Prepare) -> io::Result<NetworkConfig> {
    Ok(NetworkConfig {
        root: input.root.clone(),
        node_executable: input.transport.node_executable.clone(),
        bit_dir: input.transport.bit_dir.clone(),
        bit_version: input.transport.bit_version.clone(),
        auth_token: input.transport.token.clone(),
        global: hub::configuration(input)?,
    })
}

fn objects(selected: &[model::Selected]) -> io::Result<Vec<ObjectItem>> {
    let mut objects = Vec::new();
    let mut seen = HashMap::<String, Vec<u8>>::new();
    let mut bytes = 0usize;
    for component in selected {
        for object in &component.objects {
            append_object(&mut objects, &mut seen, &mut bytes, object)?;
        }
    }
    Ok(objects)
}

fn append_object(
    objects: &mut Vec<ObjectItem>,
    seen: &mut HashMap<String, Vec<u8>>,
    bytes: &mut usize,
    object: &ObjectItem,
) -> io::Result<()> {
    match seen.get(&object.hash) {
        Some(previous) if previous == &object.compressed => return Ok(()),
        Some(_) => return Err(invalid("outbound conflicting object bytes")),
        None => {}
    }
    *bytes = bytes
        .checked_add(object.compressed.len())
        .ok_or_else(|| invalid("outbound object budget"))?;
    if *bytes > 32 * 1024 * 1024 || objects.len() >= 4096 {
        return Err(invalid("outbound object budget"));
    }
    seen.insert(object.hash.clone(), object.compressed.clone());
    objects.push(object.clone());
    Ok(())
}

fn validate(input: &Prepare) -> io::Result<()> {
    for path in [
        &input.root,
        &input.home,
        input.resolution.globals_path(),
        &input.transport.global_config_dir,
        &input.transport.node_executable,
        &input.transport.bit_dir,
    ] {
        if !path.is_absolute() {
            return Err(invalid("outbound absolute paths"));
        }
    }
    if input.operation != "export"
        || input.ids.len() > 4096
        || input.transport.bit_version.is_empty()
        || input.transport.client_id.is_empty()
        || input.transport.export_date.is_empty()
        || input.transport.token.is_some()
    {
        return Err(invalid("outbound command requires canonical lifecycle"));
    }
    if input.options.resume
        .as_deref()
        .is_some_and(|resume| resume != input.transport.client_id)
    {
        return Err(invalid("outbound command requires canonical lifecycle"));
    }
    Ok(())
}

/// Populate the same immutable ancestry used by export and clean removal status.
pub(crate) fn prepare_version_history(
    directory: &std::path::Path,
    scope: &str,
    name: &str,
    head: &str,
) -> io::Result<(String, Vec<u8>)> {
    let history = model::prepare_history(directory, scope, name, head)?;
    Ok((history.hash, history.bytes))
}
