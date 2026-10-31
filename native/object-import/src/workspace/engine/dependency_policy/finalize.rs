pub(in crate::workspace::engine) use wire::Request;

mod environment;
mod manual;
#[cfg(test)]
mod tests;
mod wire;

use super::{invalid, io};
use serde_json::{Value, json};
use wire::Output;

pub(in crate::workspace::engine) fn apply(request: &Request) -> io::Result<(usize, Value)> {
    validate(request)?;
    let mut output = Output::new(request);
    environment::automatic(request, &mut output)?;
    environment::apply(request, &mut output)?;
    manual::apply(request, &mut output);
    Ok((1, json!(output)))
}
pub(super) fn validate(request: &Request) -> io::Result<()> {
    validate_state(request)?;
    let state = &request.state;
    let maps = state.packages
        .iter()
        .chain(&request.manual)
        .chain(&request.package_json)
        .chain([
            &request.environment.policy,
            &request.environment.model_packages,
            &request.environment.workspace.dependencies,
            &request.environment.workspace.peer_dependencies,
        ]);
    let mut count = 0;
    for map in maps {
        count += map.len();
        if map
            .iter()
            .any(|(key, val)| !valid_map_entry(key, val))
        {
            return Err(invalid("dependency finalization requires string maps"));
        }
    }
    if count > 65536
        || request.resolved.len() > 4096
        || request.environment.model_components.len() > 4096
    {
        return Err(invalid("dependency finalization row limit"));
    }
    if request.resolved
        .iter()
        .any(|(key, value)| {
            !super::wire::name(key)
                || !super::wire::name(&value.name)
                || key.trim() != value.name.trim()
        })
    {
        return Err(invalid("dependency finalization resolved name"));
    }
    Ok(())
}

fn validate_state(request: &Request) -> io::Result<()> {
    let state = &request.state;
    if state.entries.len() > 4096
        || state.components
            .iter()
            .map(Vec::len)
            .sum::<usize>()
            > 4096
        || state.components
            .iter()
            .flatten()
            .any(|index| *index >= state.entries.len())
    {
        return Err(invalid("dependency finalization component limit"));
    }
    if request.self_identity.trim().is_empty()
        || state.entries
            .iter()
            .chain(&request.environment.model_components)
            .any(|entry| {
                entry.identity.trim().is_empty()
                    || entry.package_name
                        .as_deref()
                        .is_some_and(|name| !super::wire::name(name))
            })
    {
        return Err(invalid("dependency finalization identity"));
    }
    Ok(())
}

fn valid_map_entry(key: &str, val: &Value) -> bool {
    super::wire::name(key)
        && val
            .as_str()
            .is_some_and(|ver| (ver.is_empty() || !ver.trim().is_empty()) && ver.len() <= 256)
}
