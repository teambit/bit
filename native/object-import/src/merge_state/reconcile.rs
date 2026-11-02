//! Unmerged component record reconciliation ([`Plan`], [`Entry`], [`Unrelated`], [`Relation`], [`Lane`], [`plan`], `unmerged.json`) for snap/tag parent and unrelated links.

use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

/// Deserialized unmerged-component reconciliation request (`mergeReconcilePlan`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Plan {
    is_legacy: bool,
    current_parents: Vec<String>,
    current_message: Option<String>,
    previously_used_version: Option<String>,
    entry: Entry,
}
/// Unmerged component entry from `unmerged.json` (`head`, `lane`, `unrelated`, `shouldSquash`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    head: String,
    lane: Lane,
    unrelated: Option<Unrelated>,
    should_squash: Option<bool>,
}
/// Legacy boolean or current [`Relation`] representation of an `unmerged.json` `unrelated` field.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
enum Unrelated {
    Legacy(bool),
    Current(Relation),
}
/// Unrelated-history descriptor (`unrelatedHead`, `unrelatedLane`, `headOnCurrentLane`) from `unmerged.json`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Relation {
    unrelated_head: String,
    unrelated_lane: Lane,
    head_on_current_lane: String,
}
/// Target lane `(name, scope)` identity recorded in an `unmerged.json` reconciliation entry.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Lane {
    name: String,
    scope: String,
}
impl Lane {
    fn validate(&self) -> io::Result<()> {
        for value in [&self.name, &self.scope] {
            if value.trim().is_empty() || value.len() > 32768 || value.contains('\0') {
                return Err(invalid("invalid reconciliation lane"));
            }
        }
        Ok(())
    }

    fn value(&self) -> io::Result<Value> {
        self.validate()?;
        Ok(json!({"name":self.name.trim(),"scope":self.scope.trim()}))
    }
}

pub(super) fn plan(input: &Plan) -> io::Result<Value> {
    hash(input.entry.head.trim())?;
    if input.current_parents.len() > 4096 {
        return Err(invalid("snapshot parent limit"));
    }
    for parent in &input.current_parents {
        hash(parent.trim())?;
    }
    input.entry.lane.validate()?;
    match &input.entry.unrelated {
        Some(Unrelated::Legacy(true)) => legacy_unrelated(input),
        Some(Unrelated::Current(relation)) => current_unrelated(input, relation),
        _ if input.entry.should_squash == Some(true) => squashed(input),
        _ => Ok(merged(input)),
    }
}
fn previous(input: &Plan) -> io::Result<&str> {
    let previous = input.previously_used_version
        .as_deref()
        .map(str::trim)
        .ok_or_else(|| invalid("unrelated snapshot requires previous version"))?;
    if previous.is_empty() || previous.len() > 256 || previous.contains('\0') {
        return Err(invalid("invalid previous version"));
    }
    Ok(previous)
}
fn trimmed_parents(input: &Plan) -> Vec<String> {
    input.current_parents
        .iter()
        .map(|entry| entry.trim().to_owned())
        .collect()
}
fn needs_merge_message(input: &Plan) -> bool {
    input.current_message
        .as_deref()
        .is_none_or(|msg| msg.trim().is_empty())
}
fn parents(input: &Plan, parent: &str) -> Vec<String> {
    if input.is_legacy { trimmed_parents(input) } else { vec![parent.into()] }
}
fn legacy_unrelated(input: &Plan) -> io::Result<Value> {
    let previous = previous(input)?;
    let parents = parents(input, input.entry.head.trim());
    let lane = input.entry.lane.value()?;
    Ok(json!({"mode":"unrelated","parents":parents,
        "unrelated":{"head":previous,"lane":lane},"setMergeMessage":false}))
}
fn current_unrelated(input: &Plan, relation: &Relation) -> io::Result<Value> {
    previous(input)?;
    let unrelated_head = relation.unrelated_head.trim();
    let head_on_current_lane = relation.head_on_current_lane.trim();
    hash(unrelated_head)?;
    hash(head_on_current_lane)?;
    let lane = relation.unrelated_lane.value()?;
    let parents = parents(input, head_on_current_lane);
    Ok(json!({"mode":"unrelated","parents":parents,
        "unrelated":{"head":unrelated_head,"lane":lane},"setMergeMessage":false}))
}
fn squashed(input: &Plan) -> io::Result<Value> {
    let parent = input.current_parents
        .first()
        .map(|val| val.trim())
        .ok_or_else(|| invalid("squashed snapshot requires first parent"))?;
    let lane = input.entry.lane.value()?;
    Ok(json!({"mode":"squashed","parents":trimmed_parents(input),
        "squashed":{"previousParents":[parent,input.entry.head.trim()],"lane":lane},
        "setMergeMessage":needs_merge_message(input)}))
}
fn merged(input: &Plan) -> Value {
    let mut parents = trimmed_parents(input);
    let head = input.entry.head.trim();
    if !input.is_legacy
        && !parents
            .iter()
            .any(|parent| parent.eq_ignore_ascii_case(head))
    {
        parents.push(head.to_owned());
    }
    json!({"mode":"merge","parents":parents,"setMergeMessage":needs_merge_message(input)})
}
