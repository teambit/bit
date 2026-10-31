use super::{State, append, field};
use serde_json::json;
use std::io;

pub(super) fn merge(state: &mut State<'_, '_>) -> io::Result<()> {
    if state.same(0, 1) || state.same(2, 1) {
        return Ok(());
    }
    if state.configs[..2]
        .iter()
        .any(|entry| {
            entry
                .as_ref()
                .is_some_and(|entry| entry["config"] == "-")
        })
    {
        return Err(super::super::super::invalid("removed dependency config"));
    }
    if state.same(2, 0) {
        return other_changed(state);
    }
    let mut names = Vec::new();
    for dep in state.policies[0]
        .iter()
        .chain(state.policies[1].iter())
    {
        let name = dep["dependencyId"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| super::super::super::invalid("policy name"))?;
        if !names
            .iter()
            .any(|existing| existing == name)
        {
            names.push(name.to_owned());
        }
    }
    for name in names {
        one(state, &name)?;
    }
    Ok(())
}
fn other_changed(state: &mut State<'_, '_>) -> io::Result<()> {
    for dep in state.policies[1].clone() {
        state.add_policy(&dep)?;
    }
    for dep in &state.policies[0] {
        let name = &dep["dependencyId"];
        if state.policies[2]
            .iter()
            .any(|base| base["dependencyId"] == *name)
            && !state.policies[1]
                .iter()
                .any(|other| other["dependencyId"] == *name)
        {
            let lifecycle = dep["lifecycleType"]
                .as_str()
                .ok_or_else(|| super::super::super::invalid("policy lifecycle"))?;
            append(&mut state.merged, field(lifecycle)?, json!({"name":name,"version":"-"}));
        }
    }
    Ok(())
}
fn one(state: &mut State<'_, '_>, name: &str) -> io::Result<()> {
    let current = state.policies[0]
        .iter()
        .find(|dep| dep["dependencyId"] == name)
        .cloned();
    let Some(other) = state.policies[1]
        .iter()
        .find(|dep| dep["dependencyId"] == name)
        .cloned()
    else {
        return Ok(());
    };
    let Some(current) = current else {
        return state.add_policy(&other);
    };
    let current_version = &current["value"]["version"];
    let other_version = &other["value"]["version"];
    let base = state.policies[2]
        .iter()
        .find(|dep| dep["dependencyId"] == name);
    let base_version = base.map(|dep| &dep["value"]["version"]);
    if current_version == other_version || base_version == Some(other_version) {
        return Ok(());
    }
    if base_version == Some(current_version) {
        return state.add_policy(&other);
    }
    if local(state, name, other_version.as_str())? {
        return Ok(());
    }
    resolve(state, name, &current, &other)
}
fn resolve(
    state: &mut State<'_, '_>,
    name: &str,
    current: &serde_json::Value,
    other: &serde_json::Value,
) -> io::Result<()> {
    let current_version = &current["value"]["version"];
    let other_version = &other["value"]["version"];
    match state.engine.strategy() {
        "theirs" => state.add_policy(other)?,
        "ours" => {}
        _ => {
            let lifecycle = current["lifecycleType"]
                .as_str()
                .ok_or_else(|| super::super::super::invalid("policy lifecycle"))?;
            append(
                &mut state.conflicted,
                field(lifecycle)?,
                json!({"name":name,"version":format!("CONFLICT::{}::{}::",current_version.as_str().unwrap_or(""),other_version.as_str().unwrap_or("")),"force":current["force"]}),
            );
        }
    }
    Ok(())
}
fn local(state: &State<'_, '_>, name: &str, version: Option<&str>) -> io::Result<bool> {
    let component = state.component_for_package(name);
    if let Some(component) = component {
        let id = component["id"]
            .as_str()
            .or_else(|| component["componentId"].as_str())
            .ok_or_else(|| super::super::super::invalid("component id"))?;
        return state.engine.local(id, version);
    }
    Ok(false)
}
