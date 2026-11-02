//! Incoming lane component addition planning into [`Planned`] via [`prepare`], [`addition_target`], and [`row_identity`] during checkout or switch.

use super::{Planned, Record, capture, invalid, prepare_one};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::io;

/// Captures and plans materialization for incoming lane additions on `plan`.
#[inline]
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

/// Extracts the normalized `scope/name` identity and version head from a lane addition `destination`.
fn addition_target(destination: &Value) -> io::Result<(String, &str)> {
    let head = destination["version"]
        .as_str()
        .or_else(|| destination["head"].as_str())
        .map(str::trim)
        .filter(|head| !head.is_empty())
        .ok_or_else(|| invalid("checkout lane addition head"))?;
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
            return Ok((format!("{scope}/{name}"), head));
        }
    }
    let scope = destination["scope"]
        .as_str()
        .or_else(|| destination["id"]["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("checkout lane addition scope"))?;
    let name = destination["name"]
        .as_str()
        .or_else(|| destination["id"]["name"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("checkout lane addition name"))?;
    Ok((format!("{scope}/{name}"), head))
}

/// Extracts the normalized `scope/name` component identity from `row` when present.
#[inline]
fn row_identity(row: &Value) -> Option<String> {
    if let Some(raw) = row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        let base = raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim());
        return Some(
            base.split_once('/')
                .map_or_else(|| base.to_owned(), |(sc, nm)| format!("{}/{}", sc.trim(), nm.trim())),
        );
    }
    let scope = row["scope"]
        .as_str()
        .or_else(|| row["id"]["scope"].as_str())?
        .trim();
    let name = row["name"]
        .as_str()
        .or_else(|| row["id"]["name"].as_str())?
        .trim();
    (!scope.is_empty() && !name.is_empty()).then(|| format!("{scope}/{name}"))
}

fn filter_tracked_results(context: &Value, result: &mut Value) -> io::Result<()> {
    let tracked = context["lane"]["trackedTargets"]
        .as_array()
        .ok_or_else(|| invalid("checkout lane tracked targets"))?;
    let components = result["components"]
        .as_array_mut()
        .ok_or_else(|| invalid("checkout lane component result"))?;
    let identities = tracked
        .iter()
        .filter_map(row_identity)
        .collect::<std::collections::HashSet<_>>();
    if !identities.is_empty() {
        components.retain(|row| {
            row_identity(row).is_none_or(|identity| !identities.contains(&identity))
        });
    }
    Ok(())
}
