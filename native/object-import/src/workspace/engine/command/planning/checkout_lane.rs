use super::{Planned, Record, capture, invalid, prepare_one};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::io;

pub(super) fn prepare(
    record: &mut Record,
    plan: &mut Planned,
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let names = record.context["lane"]["newFromLane"]
        .as_array()
        .ok_or_else(|| invalid("checkout lane new component list"))?;
    plan.result["newFromLane"] = Value::Array(names.clone());
    plan.result["newFromLaneAdded"] = json!(!record.request.options.workspace_only);
    filter_tracked_results(&record.context, &mut plan.result)?;
    let additions = record.context["lane"]["additions"]
        .as_array()
        .ok_or_else(|| invalid("checkout lane additions"))?
        .clone();
    for destination in additions {
        let (identity, head) = addition_target(&destination)?;
        plan.captured.push(capture::addition(&identity, &destination)?);
        let selected = json!({"kind":"target","version":head,"merge":false});
        let index = plan.captured.len() - 1;
        prepare_one(record, plan, index, &selected, snapshots)?;
        plan.result["components"]
            .as_array_mut()
            .ok_or_else(|| invalid("checkout lane component result"))?
            .pop();
    }
    Ok(())
}

fn addition_target(destination: &Value) -> io::Result<(String, &str)> {
    let head = destination["version"]
        .as_str()
        .or_else(|| destination["head"].as_str())
        .ok_or_else(|| invalid("checkout lane addition head"))?;
    if let Some(identity) = destination["identity"]
        .as_str()
        .or_else(|| destination["id"].as_str())
        .filter(|id| !id.is_empty())
    {
        let base = identity.rsplit_once('@').map_or(identity, |(base, _)| base);
        return Ok((base.to_owned(), head));
    }
    let scope = destination["scope"]
        .as_str()
        .or_else(|| destination["id"]["scope"].as_str())
        .ok_or_else(|| invalid("checkout lane addition scope"))?;
    let name = destination["name"]
        .as_str()
        .or_else(|| destination["id"]["name"].as_str())
        .ok_or_else(|| invalid("checkout lane addition name"))?;
    Ok((format!("{scope}/{name}"), head))
}

fn filter_tracked_results(context: &Value, result: &mut Value) -> io::Result<()> {
    let tracked = context["lane"]["trackedTargets"]
        .as_array()
        .ok_or_else(|| invalid("checkout lane tracked targets"))?;
    let identities = tracked
        .iter()
        .filter_map(|row| {
            row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
        })
        .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base))
        .collect::<std::collections::HashSet<_>>();
    result["components"]
        .as_array_mut()
        .ok_or_else(|| invalid("checkout lane component result"))?
        .retain(|row| {
            row["id"]
                .as_str()
                .or_else(|| row["identity"].as_str())
                .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base))
                .is_none_or(|identity| !identities.contains(identity))
        });
    Ok(())
}
