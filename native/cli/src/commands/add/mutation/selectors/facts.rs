//! Loaded-class comparison inputs survive subsequent selector and mutation cache hits.
use crate::commands::{engine::Engine, status::capture::Capture};
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::Path};

#[derive(Default)]
pub(in crate::commands::add::mutation) struct Facts {
    comparisons: HashMap<String, Value>,
    pub(super) environments: Value,
}
impl Facts {
    pub(in crate::commands::add::mutation) fn keep(&mut self, capture: &Capture) {
        for row in &capture.comparisons {
            let Some(id) = row["identity"].as_str() else {
                continue;
            };
            let mut row = row.clone();
            if let Some(fields) = row.as_object_mut() {
                fields.remove("trackingVersion");
            }
            self.comparisons.insert(id.into(), row);
        }
        let Some(facts) = capture.environment_facts.as_object() else {
            return;
        };
        if self.environments.is_null() {
            self.environments = json!({});
        }
        if let Some(map) = self.environments.as_object_mut() {
            map.extend(facts.clone());
        }
    }
    pub(super) fn compare(
        &self,
        engine: &mut Engine,
        root: &Path,
        ids: &[String],
    ) -> io::Result<Value> {
        let targets = ids
            .iter()
            .filter_map(|id| self.comparisons.get(id))
            .collect::<Vec<_>>();
        engine.request(&json!({"kind":"statusCompare","root":root,"targets":targets}))
    }
}

pub(super) fn history(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    ids: &[String],
) -> io::Result<()> {
    let targets = context["targets"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| {
            row["identity"]
                .as_str()
                .is_some_and(|id| ids.iter().any(|known| known == id))
        })
        .map(|row| json!({"identity":row["identity"],"version":row["version"]}))
        .collect::<Vec<_>>();
    let state: Value = engine.request(&json!({"kind":"statusModels","root":root,"history":true,
        "stageHistory":true,"historyTargetsOnly":true,"includeHeads":true,
        "currentLaneId":context["currentLaneId"],"targets":targets}))?;
    let plans = state["pendingHistory"]
        .as_array()
        .ok_or_else(|| io::Error::other("selector history plans"))?;
    commit_history(engine, root, plans)
}

fn commit_history(engine: &mut Engine, root: &Path, plans: &[Value]) -> io::Result<()> {
    if plans.is_empty() {
        return Ok(());
    }
    let checked: Value =
        engine.request(&json!({"kind":"statusHistoryValidate","root":root,"plans":plans}))?;
    if checked["fresh"] != true {
        return Err(io::Error::other("selector history changed"));
    }
    let result: Value =
        engine.request(&json!({"kind":"statusHistoryCommit","root":root,"plans":plans}))?;
    if result["written"]
        .as_u64()
        .is_none_or(|written| written > plans.len() as u64)
    {
        return Err(io::Error::other("selector history receipt"));
    }
    Ok(())
}
