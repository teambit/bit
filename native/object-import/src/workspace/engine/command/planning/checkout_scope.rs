//! Materialize newly discovered default-scope components within checkout's transaction.

use super::{Planned, Record, capture, invalid, prepare_one};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::io;

pub(super) fn prepare(
    record: &mut Record,
    plan: &mut Planned,
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let names = record.context["newFromScope"]
        .as_array()
        .ok_or_else(|| invalid("checkout scope result ids"))?;
    plan.result["newFromScope"] = Value::Array(names.clone());
    let additions = record.context["scopeAdditions"]
        .as_array()
        .ok_or_else(|| invalid("checkout scope addition destinations"))?
        .clone();
    for destination in additions {
        let scope = destination["scope"]
            .as_str()
            .ok_or_else(|| invalid("checkout scope addition scope"))?;
        let name =
            destination["name"].as_str().ok_or_else(|| invalid("checkout scope addition name"))?;
        let version = destination["version"]
            .as_str()
            .ok_or_else(|| invalid("checkout scope addition version"))?;
        let identity = format!("{scope}/{name}");
        plan.captured.push(capture::addition(&identity, &destination)?);
        let selected = json!({"kind":"target","version":version,"merge":false});
        let index = plan.captured.len() - 1;
        prepare_one(record, plan, index, &selected, snapshots)?;
        plan.result["components"]
            .as_array_mut()
            .ok_or_else(|| invalid("checkout scope component result"))?
            .pop();
    }
    Ok(())
}

pub(super) fn prepare_if_enabled(
    record: &mut Record,
    plan: &mut Planned,
    snapshots: &snapshots::State,
) -> io::Result<()> {
    if record.request.options.scope.include_new_from_scope {
        prepare(record, plan, snapshots)?;
    }
    Ok(())
}
