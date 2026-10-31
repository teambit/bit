pub(super) use model::State;

mod config;
mod data;
mod model;

use super::Engine;
use serde_json::{Value, json};
use std::io;

pub(super) fn merge(
    engine: &mut Engine<'_>,
    current: usize,
    other: usize,
    base: Option<usize>,
) -> io::Result<()> {
    engine.log(
        "trace",
        format!(
            "start depResolverStrategy for {}",
            engine.input["compIdStr"].as_str().map_or("", str::trim),
        ),
    );
    for (side, index) in [("current", Some(current)), ("other", Some(other)), ("base", base)] {
        let pretty = index
            .and_then(|index| engine.input[side][index]["configPretty"].as_str())
            .unwrap_or("undefined");
        engine.log("debug", format!("{side}Config, {pretty}"));
    }
    let mut state = State::new(engine, current, other, base)?;
    config::merge(&mut state)?;
    data::merge(&mut state)?;
    state.finish();
    Ok(())
}
fn append(policy: &mut Value, field: &str, row: Value) {
    if policy.get(field).is_none() {
        policy[field] = json!([]);
    }
    if let Some(rows) = policy[field].as_array_mut() {
        rows.push(row);
    }
}
fn field(lifecycle: &str) -> io::Result<&'static str> {
    match lifecycle.trim() {
        "runtime" => Ok("dependencies"),
        "dev" => Ok("devDependencies"),
        "peer" => Ok("peerDependencies"),
        _ => Err(super::super::invalid("dependency lifecycle")),
    }
}
