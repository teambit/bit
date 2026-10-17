use super::invalid;
use serde_json::{Value, json};
use std::io;

pub(super) fn apply(input: &Value) -> io::Result<Value> {
    let has_merge = boolean(input, "hasMerge")?;
    let conflicts = boolean(input, "conflicts")?;
    let strategy = parse_strategy(input.get("strategy"))?;
    let unrelated = parse_strategy(input.get("resolvedUnrelated"))?;
    let mut output = json!({"action":"load","load":if !has_merge || strategy==Some("theirs"){"remote"}else{"current"},"keepLocalVersion":has_merge && strategy==Some("theirs"),"pending":has_merge,"manualPaths":has_merge && conflicts && strategy==Some("manual")});
    early_action(has_merge, conflicts, strategy, unrelated, &mut output);
    output["shouldSquash"] = json!(boolean(input, "shouldSquash")? && has_merge);
    output["requiresCurrent"] = json!(output["action"] != "load" || unrelated.is_some());
    output["currentMissing"] =
        json!(output["requiresCurrent"] == true && !boolean(input, "hasCurrent")?);
    head_policy(input, has_merge, unrelated, &mut output)?;
    Ok(output)
}
fn head_policy(
    input: &Value,
    has_merge: bool,
    unrelated: Option<&str>,
    output: &mut Value,
) -> io::Result<()> {
    if !boolean(input, "currentLanePresent")? && !has_merge && unrelated.is_none() {
        output["headUpdate"] =
            json!(if boolean(input, "detachHead")? { "detached" } else { "main" });
    }
    if unrelated.is_some() {
        output["requiresLane"] = json!(true);
        output["pending"] = json!(true);
    }
    Ok(())
}
fn parse_strategy(value: Option<&Value>) -> io::Result<Option<&str>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) if ["ours", "theirs", "manual"].contains(&value.as_str()) => {
            Ok(Some(value))
        }
        _ => Err(invalid("unsupported merge strategy")),
    }
}
pub(super) fn boolean(input: &Value, key: &str) -> io::Result<bool> {
    input[key].as_bool().ok_or_else(|| invalid("merge flag"))
}

pub(super) fn bucket(input: &Value) -> io::Result<Value> {
    let visible = boolean(input, "currentOnLane")?;
    let hidden = boolean(input, "currentHidden")?;
    Ok(
        json!({"laneBucket":if boolean(input,"otherIsMain")? && !visible && !hidden {"skip"}else if hidden && !visible {"hidden"}else {"visible"}}),
    )
}

fn early_action(
    has_merge: bool,
    conflicts: bool,
    strategy: Option<&str>,
    unrelated: Option<&str>,
    output: &mut Value,
) {
    if has_merge && conflicts && strategy == Some("ours") {
        output["action"] = json!("oursConflict");
    } else if unrelated == Some("ours") {
        output["action"] = json!("unrelatedOurs");
        output["pending"] = json!(true);
    }
}
