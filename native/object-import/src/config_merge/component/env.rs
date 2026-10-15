use super::{
    super::{array, invalid, semver},
    Engine,
};
use serde_json::{Value, json};
use std::io;

pub(super) fn populate(engine: &mut Engine<'_>) -> io::Result<()> {
    for side in ["current", "other", "base"] {
        let env = one(engine, side)?;
        engine.envs.push(env);
    }
    Ok(())
}
fn one(engine: &mut Engine<'_>, side: &str) -> io::Result<Value> {
    let list = array(engine.input, side)?;
    let extension = list
        .iter()
        .find(|entry| entry["name"] == "teambit.envs/envs")
        .ok_or_else(|| invalid("missing env extension"))?;
    let id = extension["config"]["env"]
        .as_str()
        .filter(|id| !id.is_empty())
        .or_else(|| extension["data"]["id"].as_str())
        .ok_or_else(|| invalid("missing env"))?;
    let mut env = json!({"id":id});
    if let Some(index) = engine.find(side, id)? {
        env["sourceIndex"] = json!(index);
        let entry = &list[index];
        if let Some(version) = entry["componentId"].get("version") {
            env["version"] = version.clone();
        }
        if side != "base" {
            engine.handled.push(
                entry["stringId"]
                    .as_str()
                    .ok_or_else(|| invalid("env id"))?
                    .into(),
            );
        }
    }
    Ok(env)
}

pub(super) fn merge(engine: &mut Engine<'_>) -> io::Result<()> {
    let current = &engine.envs[0];
    let other = &engine.envs[1];
    let base = &engine.envs[2];
    if current["id"] == other["id"] && current["version"] == other["version"] {
        return Ok(());
    }
    let current_id = current["id"].as_str().ok_or_else(|| invalid("env id"))?;
    let changed = current["id"] != base["id"]
        || (current["version"].is_string()
            && base["version"].is_string()
            && current["version"] != base["version"]);
    if (changed || current["id"] == other["id"])
        && engine.local(current_id, current["version"].as_str())?
    {
        return Ok(());
    }
    let current_selector = selector(current);
    let other_selector = selector(other);
    let base_selector = selector(base);
    if monotonic(engine)? {
        return Ok(());
    }
    engine.basic("teambit.envs/envs", &current_selector, &other_selector, Some(&base_selector))
}
fn monotonic(engine: &mut Engine<'_>) -> io::Result<bool> {
    let current = &engine.envs[0];
    let other = &engine.envs[1];
    let base = &engine.envs[2];
    if engine.strategy() != "ours" || current["id"] != other["id"] {
        return Ok(false);
    }
    let (Some(current_version), Some(other_version)) =
        (current["version"].as_str(), other["version"].as_str())
    else {
        return Ok(false);
    };
    let semver = &engine.input["semver"];
    if semver[current_version].get("version").is_none()
        || semver[other_version].get("version").is_none()
    {
        return Ok(false);
    }
    if env_string(base) == env_string(current) || env_string(base) == env_string(other) {
        return Ok(false);
    }
    if semver::greater(semver, other_version, current_version)? {
        engine.rows.push(json!({"id":"teambit.envs/envs","merged":selector(other)}));
    }
    Ok(true)
}
fn env_string(env: &Value) -> String {
    let id = env["id"].as_str().unwrap_or("");
    env["version"]
        .as_str()
        .filter(|version| !version.is_empty())
        .map_or_else(|| id.into(), |version| format!("{id}@{version}"))
}
fn selector(env: &Value) -> Value {
    json!({"value":{"env":env_string(env)}})
}
