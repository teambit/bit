//! Public outbound export owner. Prepare captures and validates local objects;
//! Apply transfers their compressed bytes to the remote pending directory.
//! Canonical server actions validate/persist that pending directory before
//! Finalize publishes local bookkeeping.
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
    exported_ids: Vec<String>,
}

pub(super) struct Retained {
    token: String,
    root: PathBuf,
    pending: Pending,
    network: NetworkConfig,
    publication: Option<publication::Prepared>,
    transferred: bool,
}

struct Pending {
    scope: Option<String>,
    host: Option<String>,
    client_id: String,
    objects: Vec<ObjectItem>,
}

struct NetworkConfig {
    global_config_dir: PathBuf,
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
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("outbound-{}", state.sequence);
    let (scope, remote_host, objects, publication) = if let Some(first) = selected.first() {
        let scope = first.scope.clone();
        let host = remote::host(input, &scope)?;
        let plan = publication::prepare(input, &selected, &host)?;
        (Some(scope), Some(host), objects(&selected)?, Some(plan))
    } else {
        (None, None, Vec::new(), None)
    };
    let receipt = json!({"token":token,"owner":"rust","nothingToExport":count == 0,
        "scope":scope,"objectCount":objects.len()});
    state.outbound = Some(Retained {
        token,
        root: input.root.clone(),
        pending: Pending {
            scope,
            host: remote_host,
            client_id: input.transport.client_id.clone(),
            objects,
        },
        network: NetworkConfig {
            global_config_dir: input.transport.global_config_dir.clone(),
            bit_version: input.transport.bit_version.clone(),
            auth_token: input.transport.token.clone(),
        },
        publication,
        transferred: false,
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
    let pending = retained.pending.scope.is_some();
    if let Some(plan) = &retained.publication {
        plan.stage_history()?;
    }
    if let (Some(scope), Some(host)) = (&retained.pending.scope, &retained.pending.host) {
        remote::push(retained, scope, host)?;
    }
    retained.transferred = true;
    Ok((
        retained.pending.objects.len(),
        json!({"token":retained.token,"owner":"rust",
        "scope":retained.pending.scope,"remoteHost":retained.pending.host,
        "clientId":retained.pending.client_id,"objectCount":retained.pending.objects.len(),"pending":pending}),
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
        plan.commit(&input.exported_ids)?;
    } else if !input.exported_ids.is_empty() {
        return Err(invalid("outbound unexpected remote ids"));
    }
    let components = input.exported_ids
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
        "componentsIds":components,"newIdsOnRemote":input.exported_ids,
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
