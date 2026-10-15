//! Public outbound export owner. Prepare captures and validates local objects;
//! Apply transfers compressed objects and owns remote validation/persistence.
//! Finalize publishes local bookkeeping from the retained acknowledgements.
pub(crate) use model::{encode as encode_object, read_object};

mod lane_model;
mod lane_plan;
mod lane_publication;
mod model;
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
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
    operation: String,
    ids: Vec<String>,
    #[serde(rename = "options")]
    options: Options,
    #[serde(flatten)]
    transport: Transport,
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
    _origin_directly: bool,
    #[serde(default)]
    fork_lane_new_scope: bool,
    resume: Option<String>,
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
    selected_order: HashMap<String, usize>,
    resume: Option<ResumeContext>,
    network: NetworkConfig,
    publication: Option<Publication>,
    /// The ids the remotes persisted, once the objects are transferred.
    transferred: Option<Vec<String>>,
}

struct Pending {
    scope: String,
    host: String,
    objects: Vec<ObjectItem>,
}

use publication_state::Publication;

struct Plan {
    count: usize,
    order: HashMap<String, usize>,
    resume: Option<ResumeContext>,
    publication: Option<Publication>,
    pending: Vec<Pending>,
    fork_history: Option<lane_model::ForkHistory>,
}

struct ResumeContext {
    selected: Vec<(String, String, String)>,
}

struct NetworkConfig {
    root: PathBuf,
    global_config_dir: PathBuf,
    node_executable: PathBuf,
    bit_dir: PathBuf,
    bit_version: String,
    auth_token: Option<String>,
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
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("outbound-{}", state.sequence);
    let lane = plan.publication.as_ref().and_then(Publication::lane_name);
    let receipt =
        receipt::prepare(&token, plan.count, &plan.pending, lane, plan.fork_history.as_ref());
    state.outbound = Some(Retained {
        token,
        client_id: input.transport.client_id.clone(),
        pending: plan.pending,
        selected_order: plan.order,
        resume: plan.resume,
        network: network(input),
        publication: plan.publication,
        transferred: None,
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
    let order = selected
        .iter()
        .enumerate()
        .map(|(index, item)| (format!("{}/{}", item.scope, item.name), index))
        .collect();
    let hosts = hosts(input, &selected)?;
    let publication = if selected.is_empty() {
        None
    } else {
        Some(Publication::Main(Box::new(publication::prepare(input, &selected, &hosts)?)))
    };
    let pending = batches(selected, &hosts)?;
    Ok(Plan { count, order, resume, publication, pending, fork_history: None })
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
    if selected
        .iter()
        .any(|item| item.labels.len() > 1)
    {
        return Err(invalid("outbound resume of multiple local versions"));
    }
    Ok(Some(ResumeContext {
        selected: selected
            .iter()
            .map(|item| (item.scope.clone(), item.name.clone(), item.version.clone()))
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

fn network(input: &Prepare) -> NetworkConfig {
    NetworkConfig {
        root: input.root.clone(),
        global_config_dir: input.transport.global_config_dir.clone(),
        node_executable: input.transport.node_executable.clone(),
        bit_dir: input.transport.bit_dir.clone(),
        bit_version: input.transport.bit_version.clone(),
        auth_token: input.transport.token.clone(),
    }
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

pub(in crate::workspace::engine) fn apply(
    input: &Apply,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.outbound.as_mut().ok_or_else(|| invalid("outbound owner missing"))?;
    if retained.token != input.token || retained.transferred.is_some() {
        return Err(invalid("outbound owner token"));
    }
    let pending = !retained.pending.is_empty();
    if let Some(Publication::Main(plan)) = &retained.publication {
        plan.stage_history()?;
    }
    let mut actions = remote::Actions::new(retained)?;
    push_and_validate(retained, &mut actions)?;
    let exported_ids = persist(retained, &mut actions)?;
    if let Some(context) = retained.resume.take() {
        if let Some(Publication::Main(plan)) = retained.publication.as_mut() {
            plan.resume_acknowledgement(&context.selected, &exported_ids)?;
        } else if !exported_ids.is_empty() {
            return Err(invalid("outbound resume acknowledgement"));
        }
    }
    retained.transferred = Some(exported_ids);
    let objects = retained.pending
        .iter()
        .map(|batch| batch.objects.len())
        .sum::<usize>();
    Ok((
        objects,
        json!({"token":retained.token,"owner":"rust",
        "scopes":retained.pending.iter().map(|batch| &batch.scope).collect::<Vec<_>>(),
        "clientId":retained.client_id,"objectCount":objects,"pending":pending}),
    ))
}

/// Push every batch, then validate them all; a failure cleans the pushed
/// pending objects.
fn push_and_validate(retained: &Retained, actions: &mut remote::Actions) -> io::Result<()> {
    if retained.resume.is_none() {
        for (pushed, batch) in retained.pending.iter().enumerate() {
            if let Err(error) = remote::push(retained, batch) {
                cleanup(retained, actions, &retained.pending[..pushed]);
                return Err(error);
            }
        }
    }
    // Every batch is validated; the first failure is reported.
    let errors: Vec<io::Error> = retained.pending
        .iter()
        .filter_map(|batch| actions.validate(retained, batch).err())
        .collect();
    let Some(error) = errors.into_iter().next() else { return Ok(()) };
    if retained.resume.is_none() {
        cleanup(retained, actions, &retained.pending);
    }
    Err(io::Error::new(error.kind(), format!("outbound validate failed: {error}")))
}

fn cleanup(retained: &Retained, actions: &mut remote::Actions, batches: &[Pending]) {
    for batch in batches {
        let _ = actions.cleanup(retained, batch);
    }
}

/// Persist every batch: the remote ids, in selection order.
fn persist(retained: &Retained, actions: &mut remote::Actions) -> io::Result<Vec<String>> {
    let mut exported_ids = Vec::new();
    for batch in &retained.pending {
        exported_ids.extend(actions.persist(retained, batch)?);
    }
    exported_ids.sort_by_key(|id| {
        let identity = id.rsplit_once('@').map_or(id.as_str(), |(name, _)| name);
        retained.selected_order
            .get(identity)
            .copied()
            .unwrap_or(usize::MAX)
    });
    Ok(exported_ids)
}

pub(in crate::workspace::engine) fn finalize(
    input: &Finalize,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.outbound.take().ok_or_else(|| invalid("outbound owner missing"))?;
    let Some(exported_ids) = retained.transferred.filter(|_| retained.token == input.token) else {
        return Err(invalid("outbound owner token"));
    };
    let lane = retained.publication
        .as_ref()
        .and_then(Publication::lane_name)
        .map(str::to_owned);
    let (update_ids, removed_ids) = retained.publication
        .as_ref()
        .map(Publication::receipt_ids)
        .unwrap_or_default();
    if let Some(plan) = retained.publication {
        match plan {
            Publication::Main(plan) => plan.commit(&exported_ids)?,
            Publication::Lane { prepared, .. } => prepared.commit(&exported_ids)?,
        }
    } else if !exported_ids.is_empty() {
        return Err(invalid("outbound unexpected remote ids"));
    }
    // `ComponentIdList.uniqFromArray`: a component once, whatever its
    // number of exported versions.
    let mut components: Vec<String> = Vec::new();
    for id in &exported_ids {
        let component = id.rsplit_once('@').map_or(id.as_str(), |(component, _)| component);
        if !components
            .iter()
            .any(|known| known == component)
        {
            components.push(component.to_owned());
        }
    }
    Ok((
        components.len(),
        json!({"token":retained.token,"owner":"rust","applied":true,
        "componentsIds":components,"newIdsOnRemote":exported_ids,
        "nonExistOnBitMap":[],"removedIds":removed_ids,"missingScope":[],
        "exportedLanes":lane.into_iter().collect::<Vec<_>>(),"laneUpdateIds":update_ids,"rippleJobUrls":[]}),
    ))
}

fn validate(input: &Prepare) -> io::Result<()> {
    for path in [
        &input.root,
        &input.home,
        &input.global_remotes_file,
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
