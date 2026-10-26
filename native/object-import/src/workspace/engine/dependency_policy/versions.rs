pub(in crate::workspace::engine) use wire::Request;

mod index;
mod select;
mod validate;
mod wire;

use super::{invalid, io};
use serde_json::{Value, json};

pub(in crate::workspace::engine) fn apply(request: &Request) -> io::Result<(usize, Value)> {
    validate::validate(request)?;
    let index = index::Index::new(request);
    let mut entries = request.entries.clone();
    for (field, indices) in request.components.iter().enumerate() {
        for position in indices {
            update(&index, &mut entries[*position], field)?;
        }
    }
    let extensions = request.extensions
        .iter()
        .map(|identity| {
            Ok(select::select(&index, identity, 1, None)?
                .map_or_else(
                    || identity.clone(),
                    |(version, _, _)| wire::identity(identity, &version),
                ))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok((1, json!({"entries":entries,"extensions":extensions})))
}
fn update(
    index: &index::Index<'_>,
    entry: &mut super::wire::Entry,
    field: usize,
) -> io::Result<()> {
    let request = index.request;
    let Some((version, range, from_config)) =
        select::select(index, &entry.identity, field, entry.package_name.as_deref())?
    else {
        return Ok(());
    };
    entry.version_from_config = from_config;
    entry.identity = wire::identity(&entry.identity, &version);
    if request.policy.ranges() {
        entry.version_range = updated_range(request, entry.version_range.take(), range, &version);
    } else if field != 2
        && entry.version_range
            .as_deref()
            .is_some_and(|range| !range.is_empty() && !crate::plus_version::is_plus(range))
    {
        entry.version_range = None;
    }
    Ok(())
}

fn updated_range(
    request: &Request,
    previous: Option<String>,
    selected: Option<String>,
    version: &str,
) -> Option<String> {
    if selected
        .as_ref()
        .is_some_and(|range| !range.is_empty())
    {
        return selected;
    }
    if version != "latest"
        && !wire::snap(version)
        && let Some(prefix @ ("^" | "~")) = request.policy.prefix.as_deref()
    {
        return Some(format!("{prefix}{version}"));
    }
    previous
}
