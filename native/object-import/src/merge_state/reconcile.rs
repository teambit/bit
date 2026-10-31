use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Plan {
    is_legacy: bool,
    current_parents: Vec<String>,
    current_message: Option<String>,
    previously_used_version: Option<String>,
    entry: Entry,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    head: String,
    lane: Lane,
    unrelated: Option<Unrelated>,
    should_squash: Option<bool>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum Unrelated {
    Legacy(bool),
    Current(Relation),
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Relation {
    unrelated_head: String,
    unrelated_lane: Lane,
    head_on_current_lane: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Lane {
    name: String,
    scope: String,
}
impl Lane {
    fn value(&self) -> io::Result<Value> {
        for value in [&self.name, &self.scope] {
            if value.trim().is_empty() || value.len() > 32768 || value.contains('\0') {
                return Err(invalid("invalid reconciliation lane"));
            }
        }
        Ok(json!({"name":self.name.trim(),"scope":self.scope.trim()}))
    }
}

pub(super) fn plan(input: &Plan) -> io::Result<Value> {
    hash(&input.entry.head)?;
    if input.current_parents.len() > 4096 {
        return Err(invalid("snapshot parent limit"));
    }
    for parent in &input.current_parents {
        hash(parent)?;
    }
    let lane = input.entry.lane.value()?;
    match &input.entry.unrelated {
        Some(Unrelated::Legacy(true)) => legacy_unrelated(input, &lane),
        Some(Unrelated::Current(relation)) => current_unrelated(input, relation),
        _ if input.entry.should_squash == Some(true) => squashed(input, &lane),
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
fn parents(input: &Plan, parent: &str) -> Vec<String> {
    if input.is_legacy { input.current_parents.clone() } else { vec![parent.into()] }
}
fn legacy_unrelated(input: &Plan, lane: &Value) -> io::Result<Value> {
    let previous = previous(input)?;
    let parents = parents(input, &input.entry.head);
    Ok(json!({"mode":"unrelated","parents":parents,
        "unrelated":{"head":previous,"lane":lane},"setMergeMessage":false}))
}
fn current_unrelated(input: &Plan, relation: &Relation) -> io::Result<Value> {
    previous(input)?;
    hash(&relation.unrelated_head)?;
    hash(&relation.head_on_current_lane)?;
    let lane = relation.unrelated_lane.value()?;
    let parents = parents(input, &relation.head_on_current_lane);
    Ok(json!({"mode":"unrelated","parents":parents,
        "unrelated":{"head":relation.unrelated_head,"lane":lane},"setMergeMessage":false}))
}
fn squashed(input: &Plan, lane: &Value) -> io::Result<Value> {
    let parent = input.current_parents
        .first()
        .ok_or_else(|| invalid("squashed snapshot requires first parent"))?;
    let set_message = input.current_message.as_ref().is_none_or(String::is_empty);
    Ok(json!({"mode":"squashed","parents":input.current_parents,
        "squashed":{"previousParents":[parent,input.entry.head],"lane":lane},
        "setMergeMessage":set_message}))
}
fn merged(input: &Plan) -> Value {
    let mut parents = input.current_parents.clone();
    if !input.is_legacy
        && !parents
            .iter()
            .any(|parent| parent.trim().eq_ignore_ascii_case(input.entry.head.trim()))
    {
        parents.push(input.entry.head.trim().to_owned());
    }
    let set_message = input.current_message
        .as_ref()
        .is_none_or(|msg| msg.trim().is_empty());
    json!({"mode":"merge","parents":parents,"setMergeMessage":set_message})
}
