//! The selected checkout order is main-only bitmap IDs followed by stored Lane IDs.
use super::{command_import, invalid};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

#[inline]
pub(super) fn apply(context: &mut Value, lane: &[command_import::lane::Entry]) -> io::Result<()> {
    let order = status_load_order(context, lane)?;
    order_targets(context, &order)?;
    context["switchStatusLoadOrder"] = json!(order);
    Ok(())
}

pub(super) fn status_load_order(
    context: &Value,
    lane: &[command_import::lane::Entry],
) -> io::Result<Vec<String>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("switch targets"))?;
    let tracked = targets
        .iter()
        .map(|target| {
            target_identity(target).map(str::to_owned).ok_or_else(|| invalid("switch identity"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let lane_ids = lane
        .iter()
        .map(|entry| entry.identity.trim())
        .collect::<HashSet<_>>();
    let tracked_ids = tracked
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut ordered = Vec::with_capacity(tracked.len());
    ordered.extend(
        tracked
            .iter()
            .filter(|id| !lane_ids.contains(id.as_str()))
            .cloned(),
    );
    ordered.extend(
        lane.iter()
            .filter(|entry| tracked_ids.contains(entry.identity.trim()))
            .map(|entry| entry.identity.trim().to_owned()),
    );
    if ordered.len() != tracked.len() {
        return Err(invalid("switch ordered target identities"));
    }
    Ok(ordered)
}

pub(super) fn order_targets(context: &mut Value, order: &[String]) -> io::Result<()> {
    let targets = context["targets"].as_array_mut().ok_or_else(|| invalid("switch targets"))?;
    let mut by_id = HashMap::with_capacity(targets.len());
    for target in targets.drain(..) {
        let id = target_identity(&target).ok_or_else(|| invalid("switch identity"))?.to_owned();
        if by_id.insert(id, target).is_some() {
            return Err(invalid("switch duplicate target identity"));
        }
    }
    let ordered = order
        .iter()
        .map(|id| {
            by_id.remove(id.trim()).ok_or_else(|| invalid("switch ordered target identities"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if !by_id.is_empty() {
        return Err(invalid("switch ordered target identities"));
    }
    *targets = ordered;
    Ok(())
}

#[inline]
fn target_identity(target: &Value) -> Option<&str> {
    target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(str::trim)
        .map(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()))
        .filter(|id| !id.is_empty())
}
