//! Retained stash checkout selection; snapshot refs need not appear in model tags/heads.
pub(super) use additions::{context, materialize};
mod additions;
use super::{
    super::invalid,
    input::{Operation, Options, Prepare},
};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn loading(options: &Options) -> bool {
    options.stash.as_ref().is_some_and(|stash| stash.reset_ids.is_none())
}

pub(super) fn new_only(options: &Options) -> bool {
    loading(options)
        && options.stash.as_ref().is_some_and(|stash| stash.versions.is_empty())
}

pub(super) fn version<'a>(options: &'a Options, identity: &str) -> Option<&'a str> {
    let identity = identity.trim();
    options.stash
        .as_ref()?
        .versions
        .iter()
        .find(|row| row.identity.trim() == identity)
        .map(|row| row.version.trim())
}

pub(super) fn validate(request: &Prepare) -> io::Result<()> {
    let Some(stash) = &request.options.stash else {
        return Ok(());
    };
    validate_options(request)?;
    if stash.versions.len() > 4096 || stash.bitmap_entries.len() > 4096 {
        return Err(invalid("stash checkout selection budget"));
    }
    let mut seen = HashSet::new();
    for row in &stash.versions {
        let identity = row.identity.trim();
        let (scope, name) = identity.split_once('/').unwrap_or_default();
        if !seen.insert(identity) || scope.trim().is_empty() || name.trim().is_empty() {
            return Err(invalid("stash checkout duplicate identity"));
        }
        crate::merge_history::hash(row.version.trim())?;
    }
    validate_reset(&request.options, stash)?;
    Ok(())
}

pub(super) fn selected(options: &Options, targets: &[Value]) -> io::Result<Option<Vec<Value>>> {
    let Some(stash) = &options.stash else {
        return Ok(None);
    };
    let ids: HashSet<_> = match &stash.reset_ids {
        Some(ids) => ids.iter().map(|id| id.trim()).collect(),
        None => stash.versions
            .iter()
            .map(|row| row.identity.trim())
            .collect(),
    };
    let selected: Vec<_> = targets
        .iter()
        .filter(|row| {
            row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .map(str::trim)
                .map(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()))
                .is_some_and(|id| ids.contains(id))
        })
        .cloned()
        .collect();
    if selected.len() != ids.len() {
        return Err(invalid("stash checkout tracked identity absent"));
    }
    Ok(Some(selected))
}

fn validate_options(request: &Prepare) -> io::Result<()> {
    if request.operation != Operation::Checkout
        || request.options.pattern.is_some()
        || request.options.all
        || request.options.lane.is_some()
        || request.options.revert
        || request.options.scope.include_new_from_scope
    {
        return Err(invalid("stash checkout options"));
    }
    Ok(())
}

fn validate_reset(options: &Options, stash: &super::input::StashOptions) -> io::Result<()> {
    if let Some(ids) = &stash.reset_ids {
        if options.to.as_deref() != Some("reset")
            || !stash.versions.is_empty()
            || !stash.bitmap_entries.is_empty()
        {
            return Err(invalid("stash save reset options"));
        }
        if ids.len() > 4096 || ids.iter().collect::<HashSet<_>>().len() != ids.len() {
            return Err(invalid("stash save reset selection"));
        }
    }
    Ok(())
}
