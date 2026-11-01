//! Skipped lane-only target reporting for switch command output.

use super::invalid;
use serde_json::{Value, json};
use std::io;

pub(in super::super) fn append_skipped(
    context: &Value,
    targets: &[Value],
    result: &mut Value,
) -> io::Result<()> {
    if context["lane"]["switchId"].as_str().map(str::trim) == Some("main")
        || context["lane"]["switchId"]["name"].as_str().map(str::trim) == Some("main")
    {
        return Ok(());
    }
    let lane_only = context["lane"]["switchLaneOnly"]
        .as_array()
        .ok_or_else(|| invalid("switch lane-only result"))?;
    let added_targets = context["lane"]["addedTargets"].as_array();
    let lane_heads = &context["lane"]["switchLaneHeads"];
    let failed = result["failedComponents"]
        .as_array_mut()
        .ok_or_else(|| invalid("switch failure result"))?;
    for identity in lane_only
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
    {
        if identity.is_empty()
            || targets
                .iter()
                .any(|target| target["identity"].as_str().map(str::trim) == Some(identity))
            || added_targets.is_some_and(|rows| {
                rows.iter()
                    .any(|row| row["identity"].as_str().map(str::trim) == Some(identity))
            })
        {
            continue;
        }
        if let Some(head) = lane_heads[identity]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
        {
            push_skipped(failed, identity, head);
        }
    }
    Ok(())
}

#[inline]
fn push_skipped(failed: &mut Vec<Value>, identity: &str, head: &str) {
    let id = format!("{identity}@{head}");
    if !failed
        .iter()
        .any(|row| row["id"].as_str() == Some(id.as_str()))
    {
        failed.push(json!({"id":id,
            "unchangedMessage":format!("component {identity} is already at version {head}"),
            "unchangedLegitimately":true}));
    }
}
