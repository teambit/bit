//! Retained main-history refresh for `status --lanes`.

use super::{
    Engine,
    js::{array, decline, text},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

type Main = (Value, Value, usize, usize);
type Forked = (Engine, Value, Value, usize);

pub(super) struct Refreshes {
    main: Option<Main>,
    forked: Option<Forked>,
}

impl Refreshes {
    pub(super) fn prepare(
        engine: &mut Engine,
        root: &Path,
        context: &Value,
        result: &Value,
        lanes: bool,
    ) -> io::Result<Self> {
        let current = text(result.get("currentLaneId"))?;
        let main = if lanes && !current.ends_with("/main") {
            prepare(engine, root, context, result, current)?
        } else {
            None
        };
        let forked = if lanes {
            context["forkedFrom"]
                .as_str()
                .map(|id| prepare_forked(root, context, result, current, id))
                .transpose()?
        } else {
            None
        };
        Ok(Self { main, forked })
    }

    pub(super) fn attach(&self, result: &mut Value, context: &Value) {
        if context["forkedFrom"].is_string() {
            result["forkedLaneId"] = context["forkedFrom"].clone();
        }
        if let Some((_, updates, _, _)) = &self.main {
            result["pendingUpdatesFromMain"] = updates["pendingUpdatesFromMain"].clone();
        }
        if let Some((_, _, updates, _)) = &self.forked {
            result["updatesFromForked"] = updates["updatesFromForked"].clone();
        }
    }

    pub(super) fn progress(&self, context: &Value) -> super::loader::Progress {
        super::loader::Progress {
            main_count: self.main.as_ref().map_or(0, |(_, _, count, _)| *count),
            main_objects: self.main.as_ref().map_or(0, |(_, _, _, objects)| *objects),
            forked_count: self.forked.as_ref().map_or(0, |(_, _, _, count)| *count),
            forked_id: context["forkedFrom"].as_str().map(str::to_owned),
            ..Default::default()
        }
    }

    pub(super) fn apply(&mut self, engine: &mut Engine) -> io::Result<()> {
        if let Some((token, _, _, _)) = &self.main {
            super::super::import::apply_status_refresh(engine, token)?;
        }
        if let Some((forked_engine, token, _, _)) = &mut self.forked {
            super::super::import::apply_status_refresh(forked_engine, token)?;
        }
        Ok(())
    }
}

pub(super) fn prepare(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    result: &Value,
    current_lane_id: &str,
) -> io::Result<Option<Main>> {
    let targets = main_targets(context)?;
    if targets.is_empty() {
        return Ok(None);
    }
    let ids = targets
        .iter()
        .map(|target| text(target.get("identity")).map(str::to_owned))
        .collect::<io::Result<Vec<_>>>()?;
    let prepared = super::super::import::prepare_status_refresh(engine, root, &ids)?;
    let token = prepared.get("token").ok_or_else(|| decline("status main refresh token"))?;
    let updates: Value = engine.request(&json!({
        "kind":"statusLaneUpdates", "root":root,"token":token,
        "currentLaneId":current_lane_id,"targets":targets,
        "duringMerge":result["componentsDuringMergeState"],
    }))?;
    array(updates.get("pendingUpdatesFromMain"), "pending main updates")?;
    let count = prepared["refreshCount"]
        .as_u64()
        .and_then(|count| usize::try_from(count).ok())
        .ok_or_else(|| decline("status main refresh count"))?;
    let objects = prepared["refreshObjects"]
        .as_u64()
        .and_then(|count| usize::try_from(count).ok())
        .ok_or_else(|| decline("status main refresh objects"))?;
    Ok(Some((token.clone(), updates, count, objects)))
}

fn main_targets(context: &Value) -> io::Result<Vec<Value>> {
    let known = array(context.get("models"), "models")?
        .iter()
        .filter_map(|model| {
            Some(format!("{}/{}", model["scope"].as_str()?, model["name"].as_str()?))
        })
        .collect::<HashSet<_>>();
    Ok(array(context.get("targets"), "targets")?
        .iter()
        .filter(|target| {
            target["locallyRemoved"] != true
                && target["version"]
                    .as_str()
                    .is_some_and(|version| !version.is_empty())
                && target["identity"]
                    .as_str()
                    .is_some_and(|id| known.contains(id))
        })
        .map(|target| json!({"identity":target["identity"],"version":target["version"]}))
        .collect::<Vec<_>>())
}

pub(super) fn prepare_forked(
    root: &Path,
    context: &Value,
    result: &Value,
    current_lane_id: &str,
    forked_lane_id: &str,
) -> io::Result<Forked> {
    let mut engine = Engine::new()?;
    let prepared =
        super::super::import::prepare_status_forked_refresh(&mut engine, root, forked_lane_id)?;
    let token = prepared.get("token").ok_or_else(|| decline("status forked refresh token"))?;
    let targets = array(context.get("targets"), "targets")?
        .iter()
        .filter(|target| {
            target["version"]
                .as_str()
                .is_some_and(|version| !version.is_empty())
        })
        .map(|target| json!({"identity":target["identity"],"version":target["version"]}))
        .collect::<Vec<_>>();
    let updates: Value = engine.request(&json!({
        "kind":"statusLaneUpdates", "root":root,"token":token,
        "currentLaneId":current_lane_id,"forkedLaneId":forked_lane_id,
        "targets":targets,"duringMerge":result["componentsDuringMergeState"],
    }))?;
    array(updates.get("updatesFromForked"), "forked lane updates")?;
    let count = prepared["refreshCount"]
        .as_u64()
        .and_then(|count| usize::try_from(count).ok())
        .ok_or_else(|| decline("status forked refresh count"))?;
    Ok((engine, token.clone(), updates, count))
}
