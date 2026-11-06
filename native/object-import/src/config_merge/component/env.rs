//! `teambit.envs/envs` aspect resolution ([`populate`]) and three-way environment configuration merge on [`Engine`].

use super::{
    super::{array, invalid, semver},
    Engine,
};
use serde_json::{Value, json};
use std::io;

/// Populates [`Engine`] `envs` with the resolved environment aspect descriptor ([`one`]) for each merge side.
pub(super) fn populate(engine: &mut Engine<'_>) -> io::Result<()> {
    for side in ["current", "other", "base"] {
        let env = one(engine, side)?;
        engine.envs.push(env);
    }
    Ok(())
}
/// Resolve the `teambit.envs/envs` aspect descriptor (`id`, `sourceIndex`, `version`) for `side`.
fn one(engine: &mut Engine<'_>, side: &str) -> io::Result<Value> {
    let list = array(engine.input, side)?;
    let extension = list
        .iter()
        .find(|entry| is_envs_extension(entry))
        .ok_or_else(|| invalid("missing env extension"))?;
    let id = extension["config"]["env"]
        .as_str()
        .or_else(|| extension["data"]["id"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
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
                    .map(str::trim)
                    .filter(|val| !val.is_empty())
                    .ok_or_else(|| invalid("env id"))?
                    .into(),
            );
        }
    }
    Ok(env)
}

/// Return `true` when `entry` is the `teambit.envs/envs` aspect extension.
#[inline]
fn is_envs_extension(entry: &Value) -> bool {
    entry["name"]
        .as_str()
        .or_else(|| entry["stringId"].as_str())
        .is_some_and(|name| {
            let trimmed = name.trim();
            let bare = trimmed.rsplit_once('@').map_or(trimmed, |(prefix, _)| prefix.trim());
            bare == "teambit.envs/envs"
        })
}

/// Merge the `teambit.envs/envs` aspect across `current`, `other`, and `base` on `engine`.
pub(super) fn merge(engine: &mut Engine<'_>) -> io::Result<()> {
    let current = &engine.envs[0];
    let other = &engine.envs[1];
    let base = &engine.envs[2];
    if env_string(current) == env_string(other) {
        return Ok(());
    }
    let current_id = current["id"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| invalid("env id"))?;
    let current_ver = current["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty());
    let base_ver = base["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty());
    let changed = current["id"] != base["id"]
        || (current_ver.is_some() && base_ver.is_some() && current_ver != base_ver);
    if (changed || current["id"] == other["id"]) && engine.local(current_id, current_ver)? {
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
/// Resolve `teambit.envs/envs` monotonically by [`semver`] version when `current` and `other` share the same environment ID.
fn monotonic(engine: &mut Engine<'_>) -> io::Result<bool> {
    let current = &engine.envs[0];
    let other = &engine.envs[1];
    let base = &engine.envs[2];
    if engine.strategy() != "ours" || current["id"] != other["id"] {
        return Ok(false);
    }
    let (Some(current_version), Some(other_version)) = (
        current["version"]
            .as_str()
            .map(str::trim)
            .filter(|ver| !ver.is_empty()),
        other["version"]
            .as_str()
            .map(str::trim)
            .filter(|ver| !ver.is_empty()),
    ) else {
        return Ok(false);
    };
    let semver = &engine.input["semver"];
    if semver[current_version].get("version").is_none()
        || semver[other_version].get("version").is_none()
    {
        return Ok(false);
    }
    let base_env = env_string(base);
    if base_env == env_string(current) || base_env == env_string(other) {
        return Ok(false);
    }
    if semver::greater(semver, other_version, current_version)? {
        engine.rows.push(json!({"id":"teambit.envs/envs","merged":selector(other)}));
    }
    Ok(true)
}
#[inline]
fn env_string(env: &Value) -> String {
    let id = env["id"].as_str().map_or("", str::trim);
    env["version"]
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map_or_else(|| id.into(), |version| format!("{id}@{version}"))
}
#[inline]
fn selector(env: &Value) -> Value {
    json!({"value":{"env":env_string(env)}})
}
