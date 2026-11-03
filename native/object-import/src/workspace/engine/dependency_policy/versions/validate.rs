//! Input bounds and identity [`validate`] checks for version selection [`Request`] payloads.

use super::{Request, invalid};
use crate::workspace::engine::dependency_policy::wire::name;
use std::io;

/// Validates collection budgets and policy key spellings in `request` ([`Request`]) via [`identities`].
/// Rejects payloads whose total entry count or per-list indices exceed native bounds.
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
            .into_iter()
            .map(Vec::len)
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
    identities(request, &sources)
}
/// Validates component [`identity`] strings and package [`name`] keys across `request` ([`Request`]) and `sources`.
/// Returns an `InvalidInput` error when any identity or package name violates syntax bounds.
#[inline]
fn identities(request: &Request, sources: &[&Vec<String>; 3]) -> io::Result<()> {
    if sources
        .iter()
        .copied()
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
/// Returns `true` when `value` is a syntactically valid component identity with at most one `@version` suffix for [`identities`].
#[inline]
fn identity(value: &str) -> bool {
    let trimmed = value.trim();
    let invalid_affix = trimmed.starts_with('@') || trimmed.ends_with('@');
    if trimmed.is_empty()
        || value.len() > 4096
        || value.chars().any(char::is_control)
        || trimmed.contains('\\')
        || trimmed.contains("//")
        || invalid_affix
    {
        return false;
    }
    match trimmed.rsplit_once('@') {
        None => !trimmed.starts_with('/') && !trimmed.ends_with('/'),
        Some((base, version)) => {
            let base = base.trim();
            !base.is_empty()
                && !base.starts_with('/')
                && !base.ends_with('/')
                && !base.contains('@')
                && !version.trim().is_empty()
                && !version.contains('/')
        }
    }
}
