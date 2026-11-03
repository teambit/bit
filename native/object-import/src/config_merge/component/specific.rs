//! `keepSpecificOfOther`: preserve incoming component-specific configuration precedence ([`retain`], [`incoming`], [`preserve`]) on [`Engine`].
use super::{Engine, array, invalid};
use serde_json::{Value, json};
use std::io;

/// Preserves `specific` aspect configuration markers from `other` on [`Engine`] when `other` wins the merge.
pub(super) fn retain(engine: &mut Engine<'_>) -> io::Result<()> {
    for row in &mut engine.rows {
        if let Some(entry) = incoming(engine.input, row)?
            && let Some(merged) = row.get_mut("merged")
        {
            preserve(merged, entry);
        }
    }
    Ok(())
}

/// Return the winning `other` input entry for `row` when `merged` came from the `other` side.
fn incoming<'a>(input: &'a Value, row: &Value) -> io::Result<Option<&'a Value>> {
    let merged = &row["merged"];
    if let Some(source) = merged.get("source") {
        if source["side"].as_str().map(str::trim) != Some("other") {
            return Ok(None);
        }
        let index =
            source["index"].as_u64().ok_or_else(|| invalid("specific config index"))? as usize;
        return input["other"]
            .get(index)
            .map(Some)
            .ok_or_else(|| invalid("specific config source"));
    }
    if row["id"]
        .as_str()
        .is_none_or(|id| !is_envs_aspect_id(id))
    {
        return Ok(None);
    }
    Ok(array(input, "other")?
        .iter()
        .find(|entry| {
            entry["name"]
                .as_str()
                .or_else(|| entry["stringId"].as_str())
                .is_some_and(is_envs_aspect_id)
        }))
}

/// Return `true` when `id` (stripped of any `@version`) equals `"teambit.envs/envs"`.
#[inline]
fn is_envs_aspect_id(id: &str) -> bool {
    let trimmed = id.trim();
    let bare = trimmed.rsplit_once('@').map_or(trimmed, |(prefix, _)| prefix.trim());
    bare == "teambit.envs/envs"
}

/// Set `"__specific": true` on `merged` [`Value`] when the winning `other` `entry` has `isSpecific` enabled.
fn preserve(merged: &mut Value, entry: &Value) {
    if !super::super::truthy(&entry["isSpecific"]) {
        return;
    }
    if let Some(fields) = merged.get_mut("value").and_then(Value::as_object_mut) {
        fields.insert("__specific".into(), json!(true));
        return;
    }
    if merged.get("value").is_none_or(Value::is_null)
        && let Some(fields) = entry["config"].as_object()
    {
        let mut fields = fields.clone();
        fields.insert("__specific".into(), json!(true));
        *merged = json!({"value":Value::Object(fields)});
    }
}
