//! Public outbound export owner. Prepare captures and validates local objects;
//! Apply transfers compressed objects and owns remote validation/persistence.
//! Finalize publishes local bookkeeping from the retained acknowledgements.
mod model;
mod publication;
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
    _options: Options,
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
    root: PathBuf,
    client_id: String,
    pending: Vec<Pending>,
    selected_order: HashMap<String, usize>,
    network: NetworkConfig,
    publication: Option<publication::Prepared>,
    transferred: bool,
    exported_ids: Vec<String>,
}

struct Pending {
    scope: String,
    host: String,
    objects: Vec<ObjectItem>,
}

struct NetworkConfig {
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
    let selected = model::select(input)?;
    let count = selected.len();
    let selected_order = selected
        .iter()
        .enumerate()
        .map(|(index, item)| (format!("{}/{}", item.scope, item.name), index))
        .collect();
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("outbound-{}", state.sequence);
    let mut hosts = HashMap::new();
    for item in &selected {
        if !hosts.contains_key(&item.scope) {
            hosts.insert(item.scope.clone(), remote::host(input, &item.scope)?);
        }
    }
    let publication = if selected.is_empty() {
        None
    } else {
        Some(publication::prepare(input, &selected, &hosts)?)
    };
    let mut grouped: Vec<(String, Vec<model::Selected>)> = Vec::new();
    let mut group_indices = HashMap::new();
    for item in selected {
        let index = if let Some(index) = group_indices.get(&item.scope) {
            *index
        } else {
            let index = grouped.len();
            group_indices.insert(item.scope.clone(), index);
            grouped.push((item.scope.clone(), Vec::new()));
            index
        };
        grouped[index].1.push(item);
    }
    let pending = grouped
        .into_iter()
        .map(|(scope, selected)| {
            Ok(Pending {
                host: hosts
                    .get(&scope)
                    .ok_or_else(|| invalid("outbound remote host"))?
                    .clone(),
                scope,
                objects: objects(&selected)?,
            })
        })
        .collect::<io::Result<Vec<_>>>()?;
    let object_count = pending
        .iter()
        .map(|batch| batch.objects.len())
        .sum::<usize>();
    let receipt = json!({"token":token,"owner":"rust","nothingToExport":count == 0,
        "scopes":pending.iter().map(|batch| &batch.scope).collect::<Vec<_>>(),
        "fileRemote":pending.iter().any(|batch| batch.host.starts_with("file://")),
        "objectCount":object_count});
    state.outbound = Some(Retained {
        token,
        root: input.root.clone(),
        client_id: input.transport.client_id.clone(),
        pending,
        selected_order,
        network: NetworkConfig {
            global_config_dir: input.transport.global_config_dir.clone(),
            node_executable: input.transport.node_executable.clone(),
            bit_dir: input.transport.bit_dir.clone(),
            bit_version: input.transport.bit_version.clone(),
            auth_token: input.transport.token.clone(),
        },
        publication,
        transferred: false,
        exported_ids: Vec::new(),
    });
    Ok((count, receipt))
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
    if retained.token != input.token || retained.transferred {
        return Err(invalid("outbound owner token"));
    }
    let pending = !retained.pending.is_empty();
    if let Some(plan) = &retained.publication {
        plan.stage_history()?;
    }
    let mut actions = remote::Actions::new(retained)?;
    for (pushed, batch) in retained.pending.iter().enumerate() {
        if let Err(error) = remote::push(retained, batch) {
            for prior in &retained.pending[..pushed] {
                let _ = actions.cleanup(retained, prior);
            }
            return Err(error);
        }
    }
    let mut validation_error = None;
    for batch in &retained.pending {
        if let Err(error) = actions.validate(retained, batch)
            && validation_error.is_none()
        {
            validation_error = Some(error);
        }
    }
    if let Some(error) = validation_error {
        for pushed in &retained.pending {
            let _ = actions.cleanup(retained, pushed);
        }
        return Err(io::Error::new(error.kind(), format!("outbound validate failed: {error}")));
    }
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
    retained.exported_ids = exported_ids;
    retained.transferred = true;
    Ok((
        retained.pending
            .iter()
            .map(|batch| batch.objects.len())
            .sum(),
        json!({"token":retained.token,"owner":"rust",
        "scopes":retained.pending.iter().map(|batch| &batch.scope).collect::<Vec<_>>(),
        "clientId":retained.client_id,"objectCount":retained.pending.iter().map(|batch| batch.objects.len()).sum::<usize>(),"pending":pending}),
    ))
}

pub(in crate::workspace::engine) fn finalize(
    input: &Finalize,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.outbound.take().ok_or_else(|| invalid("outbound owner missing"))?;
    if retained.token != input.token || !retained.transferred {
        return Err(invalid("outbound owner token"));
    }
    if let Some(plan) = retained.publication {
        plan.commit(&retained.exported_ids)?;
    } else if !retained.exported_ids.is_empty() {
        return Err(invalid("outbound unexpected remote ids"));
    }
    let components = retained.exported_ids
        .iter()
        .map(|id| {
            id.rsplit_once('@')
                .map_or(id.as_str(), |(component, _)| component)
                .to_owned()
        })
        .collect::<Vec<_>>();
    Ok((
        components.len(),
        json!({"token":retained.token,"owner":"rust","applied":true,
        "componentsIds":components,"newIdsOnRemote":retained.exported_ids,
        "nonExistOnBitMap":[],"removedIds":[],"missingScope":[],
        "exportedLanes":[],"rippleJobUrls":[]}),
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
    Ok(())
}
