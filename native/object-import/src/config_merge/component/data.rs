#[cfg(test)]
#[path = "data_tests.rs"]
mod tests;

use super::{
    super::{array, invalid},
    Engine,
};
use serde_json::json;
use std::io;

pub(super) fn merge(engine: &mut Engine<'_>) -> io::Result<()> {
    if engine.input["shouldMergeAspectsData"] != true {
        return Ok(());
    }
    for (index, current) in array(engine.input, "current")?.iter().enumerate() {
        let id = non_empty_str(&current["stringId"], "data id")?;
        let bare = id
            .split('@')
            .next()
            .unwrap_or(id)
            .trim();
        if ["teambit.dependencies/dependency-resolver", "teambit.pipelines/builder"].contains(&bare)
        {
            continue;
        }
        let query = non_empty_str(&current["idWithoutVersion"], "data query")?;
        let base = engine.find("base", query)?;
        let other = engine.find("other", query)?;
        let reason = reason(engine, index, base, other)?;
        if let Some(reason) = reason {
            engine.conflicts.push(json!({"id":id,"reason":reason}));
        }
    }
    for other in array(engine.input, "other")? {
        let query = non_empty_str(&other["idWithoutVersion"], "data query")?;
        if engine.find("current", query)?.is_none() {
            engine.conflicts.push(json!({"id":other["stringId"],"reason":"missing in current"}));
        }
    }
    Ok(())
}
fn non_empty_str<'a>(value: &'a serde_json::Value, message: &str) -> io::Result<&'a str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid(message))
}
fn reason(
    engine: &mut Engine<'_>,
    index: usize,
    base: Option<usize>,
    other: Option<usize>,
) -> io::Result<Option<String>> {
    let current = &engine.input["current"][index];
    let Some(other_index) = other else {
        return Ok(Some("missing in other".into()));
    };
    let other = &engine.input["other"][other_index];
    let base = base.map(|index| &engine.input["base"][index]);
    if current["componentId"]["version"] != other["componentId"]["version"] {
        if base.map_or(&serde_json::Value::Null, |base| &base["componentId"]["version"])
            == &other["componentId"]["version"]
        {
            return Ok(None);
        }
        let version = |entry: Option<&serde_json::Value>| {
            entry
                .and_then(|entry| entry["componentId"]["version"].as_str())
                .unwrap_or("undefined")
                .to_owned()
        };
        return Ok(Some(format!(
            "version changed. base: {}, other: {}",
            version(base),
            version(Some(other)),
        )));
    }
    if equal(current, other) {
        return Ok(None);
    }
    let Some(base) = base else {
        return Ok(Some("no base-version. conflicted in data".into()));
    };
    if equal(base, other) {
        return Ok(None);
    }
    if equal(base, current) {
        engine.assignments.push(json!({"current":index,"other":other_index}));
        return Ok(None);
    }
    Ok(Some("conflicted in data since base-version".into()))
}

fn equal(left: &serde_json::Value, right: &serde_json::Value) -> bool {
    let keys = |entry: &serde_json::Value| {
        entry["dataUndefinedKeys"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(serde_json::Value::as_str)
            .map(str::to_owned)
            .collect::<std::collections::BTreeSet<_>>()
    };
    left["data"] == right["data"] && keys(left) == keys(right)
}
