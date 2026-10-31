//! `keepSpecificOfOther`: preserve incoming component configuration precedence.
use super::{Engine, array, invalid};
use serde_json::{Value, json};
use std::io;

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

fn incoming<'a>(input: &'a Value, row: &Value) -> io::Result<Option<&'a Value>> {
    let merged = &row["merged"];
    if let Some(source) = merged.get("source") {
        if source["side"] != "other" {
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
        .find(|entry| entry["name"].as_str().is_some_and(is_envs_aspect_id)))
}

fn is_envs_aspect_id(id: &str) -> bool {
    id.split('@').next() == Some("teambit.envs/envs")
}

fn preserve(merged: &mut Value, entry: &Value) {
    if entry["isSpecific"] != true {
        return;
    }
    let mut config = merged
        .get("value")
        .unwrap_or_else(|| &entry["config"])
        .clone();
    if let Some(fields) = config.as_object_mut() {
        fields.insert("__specific".into(), json!(true));
        *merged = json!({"value":config});
    }
}
