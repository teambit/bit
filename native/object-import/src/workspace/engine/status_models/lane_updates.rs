//! `LanesMain.listUpdatesFromMainPending` over a retained, uncommitted import.

use super::{Reader, history_population, indexed_models, invalid, lane, replace_models, versions};
use crate::{command_import::Overlay, read_budget::Budget};
use rayon::{ThreadPool, prelude::*};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    pub(in crate::workspace::engine) root: PathBuf,
    pub(in crate::workspace::engine) token: String,
    current_lane_id: String,
    #[serde(default)]
    forked_lane_id: Option<String>,
    targets: Vec<Target>,
    during_merge: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Target {
    identity: String,
    version: String,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    overlay: &Overlay,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    super::super::path(&request.root)?;
    if request.targets.len() > 4096 || request.during_merge.len() > 4096 {
        return Err(invalid("status lane updates target limit"));
    }
    let directory = crate::scope_path(&request.root).join("objects");
    let reader = Reader {
        directory: &directory,
        overlay: Some(overlay),
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let current = lane::read(&request.root, &reader, &request.current_lane_id)?
        .ok_or_else(|| invalid("status lane updates require a lane"))?;
    let mut models = indexed_models(&reader, &request.root, pool)?;
    replace_models(&mut models, Some(overlay));
    let models = model_index(&models)?;
    let excluded = request.during_merge
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if request.forked_lane_id.is_some() {
        return forked_updates(request, overlay, &reader, &models, &current, &excluded, pool);
    }
    let pending = pool
        .install(|| {
            request.targets
                .par_iter()
                .map(|target| pending_target(target, &reader, &models, &excluded))
                .collect::<io::Result<Vec<_>>>()
        })?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let count = pending.len();
    Ok((count, json!({"pendingUpdatesFromMain":pending})))
}

fn forked_updates(
    request: &Request,
    overlay: &Overlay,
    reader: &Reader<'_>,
    models: &HashMap<String, &Value>,
    current: &lane::Lane,
    excluded: &HashSet<&str>,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    let forked =
        request.forked_lane_id.as_deref().ok_or_else(|| invalid("status forked lane id"))?;
    if current.forked_from.as_deref() != Some(forked) {
        return Err(invalid("status forked lane identity"));
    }
    let (scope, name) = forked.split_once('/').ok_or_else(|| invalid("status forked lane id"))?;
    let refs = overlay.lane_refs(scope, name).ok_or_else(|| invalid("status forked lane refs"))?;
    let heads = refs
        .iter()
        .map(|row| {
            let (scope, name) =
                crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(
                    row,
                )
                .ok_or_else(|| invalid("status forked scope"))?;
            let head = row["head"].as_str().ok_or_else(|| invalid("status forked head"))?;
            Ok((format!("{scope}/{name}"), head))
        })
        .collect::<io::Result<HashMap<_, _>>>()?;
    let updates = pool
        .install(|| {
            request.targets
                .par_iter()
                .map(|target| forked_target(target, reader, models, current, &heads, excluded))
                .collect::<io::Result<Vec<_>>>()
        })?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    Ok((updates.len(), json!({"updatesFromForked":updates,"forkedLaneId":forked})))
}

fn forked_target(
    target: &Target,
    reader: &Reader<'_>,
    models: &HashMap<String, &Value>,
    current: &lane::Lane,
    heads: &HashMap<String, &str>,
    excluded: &HashSet<&str>,
) -> io::Result<Option<Value>> {
    if target.version.is_empty() || excluded.contains(target.identity.as_str()) {
        return Ok(None);
    }
    let (Some(model), Some(source), Some(main)) = (
        lookup_model(models, &target.identity),
        current.heads.get(&target.identity),
        heads.get(&target.identity),
    ) else {
        return Ok(None);
    };
    let (records, _) = history_population::prepare(
        reader,
        model,
        &target.identity,
        &[Some(source), Some(main)],
        true,
    )?;
    let distance = crate::merge_history::status::distance(&records, Some(source), Some(main))?;
    let diverge = diverge_data(&distance)?;
    Ok(diverge.map(|diverge| json!({"id":target.identity,"divergeData":diverge})))
}

fn model_index(models: &[Value]) -> io::Result<HashMap<String, &Value>> {
    models
        .iter()
        .map(|model| {
            let scope = model["scope"].as_str().unwrap_or_default();
            let name = model["name"].as_str().ok_or_else(|| invalid("status model name"))?;
            let key = if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") };
            Ok((key, model))
        })
        .collect()
}

fn lookup_model<'a>(models: &HashMap<String, &'a Value>, identity: &str) -> Option<&'a Value> {
    models
        .get(identity)
        .or_else(|| {
            identity
                .split_once('/')
                .and_then(|(_, name)| models.get(name))
        })
        .copied()
}

fn pending_target(
    target: &Target,
    reader: &Reader<'_>,
    models: &HashMap<String, &Value>,
    excluded: &HashSet<&str>,
) -> io::Result<Option<Value>> {
    if target.version.is_empty() || excluded.contains(target.identity.as_str()) {
        return Ok(None);
    }
    let Some(model) = lookup_model(models, &target.identity) else { return Ok(None) };
    let Some(main) = model["head"].as_str() else { return Ok(None) };
    let source = versions::reference(model, &target.version)?;
    if source == main {
        return Ok(None);
    }
    let (records, _) = history_population::prepare(
        reader,
        model,
        &target.identity,
        &[Some(&source), Some(main)],
        true,
    )?;
    let distance = crate::merge_history::status::distance(&records, Some(&source), Some(main))?;
    let diverge = diverge_data(&distance)?;
    Ok(diverge.map(|diverge| json!({"id":target.identity,"divergeData":diverge})))
}

fn diverge_data(distance: &Value) -> io::Result<Option<Value>> {
    if distance["noCommon"] == true {
        return Err(invalid("status main update has no common snap"));
    }
    let target_only = hashes(&distance["targetOnly"])?;
    if target_only.is_empty() {
        return Ok(None);
    }
    let mut diverge = json!({
        "snapsOnSourceOnly": hashes(&distance["sourceOnly"])?,
        "snapsOnTargetOnly": target_only,
    });
    if let Some(common) = distance["common"].as_str() {
        diverge["commonSnapBeforeDiverge"] = json!({"hash":common});
    }
    Ok(Some(diverge))
}

fn hashes(value: &Value) -> io::Result<Vec<Value>> {
    value
        .as_array()
        .ok_or_else(|| invalid("status lane update distance"))?
        .iter()
        .map(|hash| {
            let hash = hash.as_str().ok_or_else(|| invalid("status lane update hash"))?;
            crate::merge_history::hash(hash)?;
            Ok(json!({"hash":hash}))
        })
        .collect()
}
