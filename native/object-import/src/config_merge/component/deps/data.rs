use super::{State, append, field, model::version};
use serde_json::{Value, json};
use std::io;

pub(super) fn merge(state: &mut State<'_, '_>) -> io::Result<()> {
    for (index, side) in ["current", "other", "base"].iter().enumerate() {
        log_side_data(state, index, side);
    }
    let mut ids = Vec::new();
    for dep in state.data[0]
        .iter()
        .chain(state.data[1].iter())
        .filter(|dep| dep["source"] == "auto")
    {
        let id = dep["id"]
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())
            .or_else(|| {
                dep["componentId"]
                    .as_str()
                    .map(str::trim)
                    .filter(|val| !val.is_empty())
            })
            .ok_or_else(|| super::super::super::invalid("data id"))?;
        if !ids
            .iter()
            .any(|existing| existing == id)
        {
            ids.push(id.to_owned());
        }
    }
    for id in ids {
        one(state, &id)?;
    }
    Ok(())
}

fn log_side_data(state: &mut State<'_, '_>, index: usize, side: &str) {
    let entries = state.data[index]
        .iter()
        .filter(|dep| index == 0 || dep["source"] == "auto")
        .collect::<Vec<_>>();
    let lines = entries
        .iter()
        .map(|dep| {
            format!(
                "{} {} {}",
                dep["__type"].as_str().unwrap_or("undefined"),
                dep["id"].as_str().unwrap_or("undefined"),
                dep["version"].as_str().unwrap_or("undefined"),
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    state.engine.log("debug", format!("{side}Data, {}\n{lines}", entries.len()));
}
fn one(state: &mut State<'_, '_>, id: &str) -> io::Result<()> {
    state.engine.log("trace", format!("depData.id, {id}"));
    if state.engine.envs[..2]
        .iter()
        .any(|env| env["id"] == id)
    {
        return Ok(());
    }
    let current = state.data[0]
        .iter()
        .find(|dep| dep["id"] == id)
        .cloned();
    let other = state.data[1]
        .iter()
        .find(|dep| dep["id"] == id && dep["source"] == "auto")
        .cloned();
    let base = state.data[2]
        .iter()
        .find(|dep| dep["id"] == id && dep["source"] == "auto")
        .cloned();
    state.engine.meta("trace", "currentDep", current.as_ref());
    state.engine.meta("trace", "otherDep", other.as_ref());
    state.engine.meta("trace", "baseDep", base.as_ref());
    let Some(other) = other else {
        return Ok(());
    };
    let Some(current) = current else {
        if base.is_none() {
            state.add_data(&other)?;
        }
        return Ok(());
    };
    paired(state, id, &current, &other, base.as_ref())
}
fn paired(
    state: &mut State<'_, '_>,
    id: &str,
    current: &Value,
    other: &Value,
    base: Option<&Value>,
) -> io::Result<()> {
    if compatible(state, current, other)? {
        return Ok(());
    }
    let current_version = version(current);
    let other_version = version(other);
    let base_version = base.map(version);
    if current_version == other_version || base_version == Some(other_version) {
        return Ok(());
    }
    if is_local(state, id, current, other)? {
        return Ok(());
    }
    let lifecycle = current["lifecycle"]
        .as_str()
        .ok_or_else(|| super::super::super::invalid("data lifecycle"))?;
    let field = field(lifecycle)?;
    if state.has(field, id) {
        return Ok(());
    }
    if base_version == Some(current_version) || state.engine.strategy() == "theirs" {
        return state.add_data(other);
    }
    if state.engine.strategy() == "ours" {
        return Ok(());
    }
    let name = if current["__type"] == "component" {
        current["packageName"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| super::super::super::invalid("packageName"))?
    } else {
        id
    };
    append(
        &mut state.conflicted,
        field,
        json!({"name":name,"version":format!("CONFLICT::{current_version}::{other_version}::"),"force":false}),
    );
    Ok(())
}
fn compatible(state: &State<'_, '_>, current: &Value, other: &Value) -> io::Result<bool> {
    let (Some(current_policy), Some(other_policy)) = (
        current["policy"]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty()),
        other["policy"]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty()),
    ) else {
        return Ok(false);
    };
    let current_version = current["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .ok_or_else(|| super::super::super::invalid("current version"))?;
    let other_version = other["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .ok_or_else(|| super::super::super::invalid("other version"))?;
    Ok(super::super::super::semver::satisfies(
        &state.engine.input["semver"],
        current_version,
        other_policy,
    )? || super::super::super::semver::satisfies(
        &state.engine.input["semver"],
        other_version,
        current_policy,
    )?)
}

fn is_local(state: &State<'_, '_>, id: &str, current: &Value, other: &Value) -> io::Result<bool> {
    Ok(current["__type"] == "component" && state.engine.local(id, other["version"].as_str())?)
}
