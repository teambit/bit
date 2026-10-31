use super::{Request, invalid};
use crate::workspace::engine::dependency_policy::wire::name;
use std::io;

pub(super) fn validate(request: &Request) -> io::Result<()> {
    let sources = [&request.sources.bitmap, &request.sources.lane, &request.sources.model];
    let maps = request.policy.manual
        .iter()
        .chain(&request.policy.automatic)
        .chain(&request.policy.merge)
        .chain([&request.policy.workspace, &request.sources.component_config]);
    let mut count = request.entries.len()
        + request.extensions.len()
        + request.grammar.len()
        + request.policy.env_own.len()
        + sources
            .iter()
            .map(|ids| ids.len())
            .sum::<usize>()
        + request.components
            .iter()
            .map(Vec::len)
            .sum::<usize>();
    for map in maps {
        count += map.len();
        if map.keys().any(|key| !name(key)) {
            return Err(invalid("dependency version policy key"));
        }
    }
    if count > 65536
        || request.entries.len() > 4096
        || request.extensions.len() > 4096
        || request.components
            .iter()
            .flatten()
            .any(|index| *index >= request.entries.len())
    {
        return Err(invalid("dependency version row limit"));
    }
    identities(request)
}
fn identities(request: &Request) -> io::Result<()> {
    let sources = [&request.sources.bitmap, &request.sources.lane, &request.sources.model];
    if sources
        .into_iter()
        .flatten()
        .chain(&request.extensions)
        .any(|id| !identity(id))
        || request.policy.env_own
            .iter()
            .any(|key| !name(key))
        || request.entries
            .iter()
            .any(|entry| {
                !identity(&entry.identity)
                    || entry.package_name
                        .as_deref()
                        .is_some_and(|key| !name(key))
            })
    {
        return Err(invalid("dependency version component identity"));
    }
    Ok(())
}
fn identity(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || value.len() > 4096
        || value.contains('\0')
        || trimmed.starts_with('@')
        || trimmed.ends_with('@')
    {
        return false;
    }
    match trimmed.split_once('@') {
        None => true,
        Some((base, version)) => {
            !base.trim().is_empty() && !version.trim().is_empty() && !version.contains('@')
        }
    }
}
