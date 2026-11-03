//! Per-component merge strategy, head-update, and squash decision evaluation ([`apply`], [`bucket`], [`boolean`], `mergeApplyDecision`).

use super::invalid;
use serde_json::{Value, json};
use std::io;

/// Evaluates per-component merge action, head policy, and squash flags from `input`.
pub(super) fn apply(input: &Value) -> io::Result<Value> {
    let has_merge = boolean(input, "hasMerge")?;
    let conflicts = boolean(input, "conflicts")?;
    let strategy = parse_strategy(input.get("strategy"))?;
    let unrelated = parse_strategy(input.get("resolvedUnrelated"))?;
    if unrelated == Some("manual") {
        return Err(invalid("unsupported merge strategy"));
    }
    let (action, pending) = early_action(has_merge, conflicts, strategy, unrelated);
    let requires_current = action != "load" || unrelated.is_some();
    let mut output = json!({
        "action": action,
        "load": if !has_merge || strategy == Some("theirs") { "remote" } else { "current" },
        "keepLocalVersion": has_merge && strategy == Some("theirs"),
        "pending": pending,
        "manualPaths": has_merge && conflicts && strategy == Some("manual"),
        "shouldSquash": boolean(input, "shouldSquash")? && has_merge,
        "requiresCurrent": requires_current,
        "currentMissing": requires_current && !boolean(input, "hasCurrent")?,
    });
    head_policy(input, has_merge, unrelated, &mut output)?;
    Ok(output)
}
/// Populates `headUpdate`, `requiresLane`, and `pending` fields on `output` [`Value`] from `input`.
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
/// Parses an optional merge strategy string (`"ours"`, `"theirs"`, or `"manual"`).
fn parse_strategy(value: Option<&Value>) -> io::Result<Option<&'static str>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(raw)) if raw.len() <= 64 => {
            let raw = raw.trim();
            if raw.is_empty() {
                Ok(None)
            } else if raw.eq_ignore_ascii_case("ours") {
                Ok(Some("ours"))
            } else if raw.eq_ignore_ascii_case("theirs") {
                Ok(Some("theirs"))
            } else if raw.eq_ignore_ascii_case("manual") {
                Ok(Some("manual"))
            } else {
                Err(invalid("unsupported merge strategy"))
            }
        }
        _ => Err(invalid("unsupported merge strategy")),
    }
}
/// Reads a required boolean or `"true"`/`"false"` string flag at `key` from `input`.
pub(super) fn boolean(input: &Value, key: &str) -> io::Result<bool> {
    if let Some(flag) = input[key].as_bool() {
        return Ok(flag);
    }
    if let Some(raw) = input[key].as_str() {
        let raw = raw.trim();
        if raw.eq_ignore_ascii_case("true") {
            return Ok(true);
        }
        if raw.eq_ignore_ascii_case("false") {
            return Ok(false);
        }
    }
    Err(invalid("merge flag"))
}

/// Computes the `laneBucket` (`"skip"`, `"hidden"`, or `"visible"`) for a lane merge component entry.
pub(super) fn bucket(input: &Value) -> io::Result<Value> {
    let visible = boolean(input, "currentOnLane")?;
    let hidden = boolean(input, "currentHidden")?;
    Ok(
        json!({"laneBucket":if boolean(input,"otherIsMain")? && !visible && !hidden {"skip"}else if hidden && !visible {"hidden"}else {"visible"}}),
    )
}

#[inline]
fn early_action(
    has_merge: bool,
    conflicts: bool,
    strategy: Option<&str>,
    unrelated: Option<&str>,
) -> (&'static str, bool) {
    if has_merge && conflicts && strategy == Some("ours") {
        ("oursConflict", has_merge)
    } else if unrelated == Some("ours") {
        ("unrelatedOurs", true)
    } else {
        ("load", has_merge)
    }
}
