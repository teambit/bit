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
    let bitmap = index.bitmap
        .get(base)
        .copied()
        .flatten();
    if let Some(value) = request.sources.component_config
        .get(base)
        .filter(|value| !value.is_empty())
    {
        return Ok(Some((value.clone(), None, true)));
    }
    if let Some(name) = package
        && !(index.env.contains(name) && bitmap.is_some())
        && let Some(spec) = request.policy.manual[field]
            .get(name)
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
    Ok(index.model
        .get(base)
        .copied()
        .or_else(|| (!matches!(version(identity), "latest" | "head")).then(|| version(identity)))
        .map(|value| (value.to_owned(), None, false)))
}
fn package_policy(request: &Request, identity: &str, name: &str) -> io::Result<Choice> {
    if let version = version(identity)
        && !matches!(version, "latest" | "head")
        && let Some(spec) = request.policy.workspace
            .get(name)
            .filter(|spec| !spec.is_empty())
    {
        let range =
            (request.policy.ranges() && grammar(request, spec)?.range).then(|| spec.clone());
        return Ok(Some((version.to_owned(), range)));
    }
    if let Some(spec) = request.policy.merge
        .iter()
        .filter_map(|map| map.get(name))
        .rfind(|spec| !spec.is_empty())
        && let Some((version, _)) = valid(request, spec)?
    {
        return Ok(Some((version, None)));
    }
    if request.policy.automatic
        .iter()
        .any(|map| {
            map.get(name)
                .is_some_and(|value| !value.is_empty())
        })
    {
        return Ok(Some((version(identity).to_owned(), None)));
    }
    Ok(None)
}
fn valid(request: &Request, spec: &str) -> io::Result<Choice> {
    if let Some(hash) = spec.strip_prefix("0.0.0-")
        && snap(hash)
    {
        return Ok(Some((hash.to_owned(), None)));
    }
    let parsed = grammar(request, spec)?;
    if parsed.valid {
        return Ok(Some((spec.to_owned(), None)));
    }
    if parsed.range
        && let Some(version) = &parsed.coerced
    {
        return Ok(Some((version.clone(), Some(spec.to_owned()))));
    }
    Ok(snap(spec).then(|| (spec.to_owned(), None)))
}
fn grammar<'a>(request: &'a Request, spec: &str) -> io::Result<&'a super::wire::Grammar> {
    request.grammar.get(spec).ok_or_else(|| invalid("dependency version grammar missing"))
}
