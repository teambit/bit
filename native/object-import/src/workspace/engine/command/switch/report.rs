use super::invalid;
use serde_json::{Value, json};
use std::io;

pub(in super::super) fn append_skipped(
    context: &Value,
    targets: &[Value],
    result: &mut Value,
) -> io::Result<()> {
    if context["lane"]["switchId"] == "main" || context["lane"]["switchId"]["name"] == "main" {
        return Ok(());
    }
    let lane_only = context["lane"]["switchLaneOnly"]
        .as_array()
        .ok_or_else(|| invalid("switch lane-only result"))?;
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
            || context["lane"]["addedTargets"]
                .as_array()
                .is_some_and(|rows| {
                    rows.iter()
                        .any(|row| row["identity"].as_str().map(str::trim) == Some(identity))
                })
        {
            continue;
        }
        if let Some(head) = context["lane"]["switchLaneHeads"][identity]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
        {
            failed.push(json!({"id":format!("{identity}@{head}"),
                "unchangedMessage":format!("component {identity} is already at version {head}"),
                "unchangedLegitimately":true}));
        }
    }
    Ok(())
}
