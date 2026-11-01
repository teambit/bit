//! Three-way `teambit.dependencies/dependency-resolver` configuration and data merge strategy.

pub(super) use model::State;

mod config;
mod data;
mod model;

use super::Engine;
use serde_json::Value;
use std::io;

pub(super) fn merge(
    engine: &mut Engine<'_>,
    current: usize,
    other: usize,
    base: Option<usize>,
) -> io::Result<()> {
    if engine.input["current"].get(current).is_none()
        || engine.input["other"].get(other).is_none()
        || base.is_some_and(|idx| engine.input["base"].get(idx).is_none())
    {
        return Err(super::super::invalid("dependency resolver index"));
    }
    engine.log(
        "trace",
        format!(
            "start depResolverStrategy for {}",
            engine.input["compIdStr"].as_str().map_or("", str::trim),
        ),
    );
    for (side, index) in [("current", Some(current)), ("other", Some(other)), ("base", base)] {
        let pretty = index
            .and_then(|index| engine.input[side].get(index))
            .and_then(|entry| entry["configPretty"].as_str())
            .unwrap_or("undefined");
        engine.log("debug", format!("{side}Config, {pretty}"));
    }
    let mut state = State::new(engine, current, other, base)?;
    config::merge(&mut state)?;
    data::merge(&mut state)?;
    state.finish();
    Ok(())
}
#[inline]
fn append(policy: &mut Value, field: &str, row: Value) {
    let Some(map) = policy.as_object_mut() else {
        return;
    };
    if let Some(rows) = map.get_mut(field).and_then(Value::as_array_mut) {
        rows.push(row);
    } else {
        map.insert(field.to_owned(), Value::Array(vec![row]));
    }
}
#[inline]
fn field(lifecycle: &str) -> io::Result<&'static str> {
    match lifecycle.trim() {
        "runtime" => Ok("dependencies"),
        "dev" => Ok("devDependencies"),
        "peer" => Ok("peerDependencies"),
        _ => Err(super::super::invalid("dependency lifecycle")),
    }
}
