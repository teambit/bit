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
    let additions = record.context["lane"]["additions"]
        .as_array()
        .ok_or_else(|| invalid("checkout lane additions"))?
        .clone();
    for destination in additions {
        let scope =
            destination["scope"].as_str().ok_or_else(|| invalid("checkout lane addition scope"))?;
        let name =
            destination["name"].as_str().ok_or_else(|| invalid("checkout lane addition name"))?;
        let head = destination["version"]
            .as_str()
            .ok_or_else(|| invalid("checkout lane addition head"))?;
        let identity = format!("{scope}/{name}");
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
