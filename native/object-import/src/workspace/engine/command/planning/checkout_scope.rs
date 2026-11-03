//! Materialize newly discovered default-scope components into [`Planned`] via [`prepare`], [`addition_target`], and [`prepare_if_enabled`].
//! Rejects duplicate additions already present in `plan.captured`.

use super::{Planned, Record, capture, invalid, prepare_one};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::io;

/// Captures and plans materialization for newly discovered default-scope additions via [`addition_target`] and [`prepare_one`].
#[inline]
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
        .ok_or_else(|| invalid("checkout scope addition destinations"))?;
    if additions.is_empty() {
        return Ok(());
    }
    for destination in additions.clone() {
        let (identity, version) = addition_target(&destination)?;
        if plan.captured
            .iter()
            .any(|item| item.target.identity.trim() == identity)
        {
            return Err(invalid("checkout scope duplicate addition"));
        }
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

/// Extracts the normalized `scope/name` identity and version string from a scope addition `destination`.
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
        if let Some((scope, name)) = base
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        {
            return Ok((format!("{scope}/{name}"), version));
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

/// Runs [`prepare`] when `include_new_from_scope` is enabled on `record.request.options.scope`.
#[inline]
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
