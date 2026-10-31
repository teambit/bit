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
        let (identity, version) = addition_target(&destination)?;
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

fn addition_target(destination: &Value) -> io::Result<(String, &str)> {
    let version = destination["version"]
        .as_str()
        .or_else(|| destination["head"].as_str())
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .ok_or_else(|| invalid("checkout scope addition version"))?;
    if let Some(identity) = destination["identity"]
        .as_str()
        .or_else(|| destination["id"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        let base = identity.rsplit_once('@').map_or(identity, |(base, _)| base.trim());
        if !base.is_empty() {
            return Ok((base.to_owned(), version));
        }
    }
    let scope = destination["scope"]
        .as_str()
        .or_else(|| destination["id"]["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("checkout scope addition scope"))?;
    let name = destination["name"]
        .as_str()
        .or_else(|| destination["id"]["name"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("checkout scope addition name"))?;
    Ok((format!("{scope}/{name}"), version))
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
