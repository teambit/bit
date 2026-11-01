//! Precedence-ordered version and range selection for a single dependency entry.

use super::{
    Request, invalid,
    wire::{snap, unversioned, version},
};
use std::io;

type Choice = Option<(String, Option<String>)>;
type Selected = Option<(String, Option<String>, bool)>;
pub(super) fn select(
    index: &super::index::Index<'_>,
    identity: &str,
    field: usize,
    package: Option<&str>,
) -> io::Result<Selected> {
    let request = index.request;
    let base = unversioned(identity);
    let package = package
        .map(str::trim)
        .filter(|name| !name.is_empty());
    let bitmap = index.bitmap
        .get(base)
        .copied()
        .flatten();
    if let Some(value) = request.sources.component_config
        .get(base)
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(Some((value.to_owned(), None, true)));
    }
    if let Some(name) = package
        && !(index.env.contains(name) && bitmap.is_some())
        && let Some(spec) = request.policy.manual[field]
            .get(name)
            .map(String::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        && let Some((version, range)) = valid(request, spec)?
    {
        return Ok(Some((version, range, true)));
    }
    if let Some(value) = bitmap.or_else(|| index.lane.get(base).copied()) {
        return Ok(Some((value.to_owned(), None, false)));
    }
    if let Some(name) = package
        && let Some((version, range)) = package_policy(request, identity, name)?
    {
        return Ok(Some((version, range, false)));
    }
    Ok(default_version(index, identity, base))
}
#[inline]
fn default_version(index: &super::index::Index<'_>, identity: &str, base: &str) -> Selected {
    let ver = version(identity);
    index.model
        .get(base)
        .copied()
        .or_else(|| concrete_version(ver).then_some(ver))
        .map(|value| (value.to_owned(), None, false))
}
fn package_policy(request: &Request, identity: &str, name: &str) -> io::Result<Choice> {
    let ver = version(identity);
    let pinned = concrete_version(ver);
    if pinned
        && let Some(spec) = request.policy.workspace
            .get(name)
            .map(String::as_str)
            .map(str::trim)
            .filter(|spec| !spec.is_empty())
    {
        let range =
            (request.policy.ranges() && grammar(request, spec)?.range).then(|| spec.to_owned());
        return Ok(Some((ver.to_owned(), range)));
    }
    if let Some(spec) = request.policy.merge
        .iter()
        .filter_map(|map| map.get(name))
        .map(String::as_str)
        .map(str::trim)
        .rfind(|spec| !spec.is_empty())
        && let Some((version, _)) = valid(request, spec)?
    {
        return Ok(Some((version, None)));
    }
    if pinned
        && request.policy.automatic
            .iter()
            .any(|map| {
                map.get(name)
                    .is_some_and(|value| {
                        let trimmed = value.trim();
                        !trimmed.is_empty() && trimmed != "-"
                    })
            })
    {
        return Ok(Some((ver.to_owned(), None)));
    }
    Ok(None)
}
#[inline]
fn concrete_version(ver: &str) -> bool {
    !ver.eq_ignore_ascii_case("latest") && !ver.eq_ignore_ascii_case("head")
}
fn valid(request: &Request, spec: &str) -> io::Result<Choice> {
    let spec = spec.trim();
    if let Some(hash) = spec.strip_prefix("0.0.0-")
        && snap(hash)
    {
        return Ok(Some((hash.to_ascii_lowercase(), None)));
    }
    let parsed = grammar(request, spec)?;
    if parsed.valid {
        return Ok(Some((spec.to_owned(), None)));
    }
    if parsed.range
        && let Some(version) = parsed.coerced
            .as_deref()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
    {
        return Ok(Some((version.to_owned(), Some(spec.to_owned()))));
    }
    Ok(snap(spec).then(|| (spec.to_ascii_lowercase(), None)))
}
#[inline]
fn grammar<'a>(request: &'a Request, spec: &str) -> io::Result<&'a super::wire::Grammar> {
    request.grammar
        .get(spec)
        .or_else(|| request.grammar.get(spec.trim()))
        .ok_or_else(|| invalid("dependency version grammar missing"))
}
