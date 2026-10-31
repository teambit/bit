//! `getLocalHashes` uses graph divergence before filtering lean-lane origin refs.
use super::{Repository, Selection, diagnostics, invalid, outbound};
use serde_json::Value;
use std::io;

pub(super) fn select(repository: &Repository, head_only: bool) -> io::Result<Selection> {
    let distance = distance(repository, &repository.heads.current)?;
    let mut local = hashes(&distance)?;
    add_detached(repository, &mut local)?;
    let mut removed = Vec::new();
    for hash in local {
        if eligible(repository, &hash)? {
            removed.push(hash);
        }
    }
    validate_selection(repository, &removed, head_only)?;
    if head_only {
        removed = vec![repository.heads.current.clone()];
    }
    let next = replacement(repository, &removed, &distance, head_only)?;
    let common = distance["common"].as_str();
    // Only the all-version path returns the cached common Ref itself. Node's
    // head-only parent Ref has a distinct identity even when its hash matches.
    let keep_lane = next.is_some()
        && (head_only || repository.heads.remote.is_some() || next.as_deref() != common);
    let mut selection = Selection::new(removed, next, head_only);
    selection.keep_lane = keep_lane;
    tag_labels(&mut selection, &repository.model);
    Ok(selection)
}

fn tag_labels(selection: &mut Selection, model: &Value) {
    for label in &mut selection.labels {
        if let Some(tag) = model["versions"]
            .as_object()
            .into_iter()
            .chain(model["orphanedVersions"].as_object())
            .flat_map(|versions| versions.iter())
            .find_map(|(tag, hash)| (hash.as_str() == Some(label.as_str())).then_some(tag))
        {
            label.clone_from(tag);
        }
    }
}

fn hashes(distance: &Value) -> io::Result<Vec<String>> {
    distance["sourceOnly"]
        .as_array()
        .ok_or_else(|| invalid("lane reset divergence"))?
        .iter()
        .map(|hash| {
            hash.as_str()
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| invalid("lane reset divergence hash"))
        })
        .collect()
}

fn add_detached(repository: &Repository, local: &mut Vec<String>) -> io::Result<()> {
    if repository.model["detachedHeads"]["heads"].as_array().is_none_or(Vec::is_empty) {
        return Ok(());
    }
    let Some(head) = repository.model["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty())
    else {
        return Ok(());
    };
    let distance = distance(repository, head)?;
    for hash in hashes(&distance)? {
        if !local.contains(&hash) {
            local.push(hash);
        }
    }
    Ok(())
}

fn eligible(repository: &Repository, hash: &str) -> io::Result<bool> {
    if hash == repository.heads.current {
        return Ok(true);
    }
    let version = match outbound::read_object(&repository.objects, hash, "Version") {
        Ok(version) => version,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    Ok(version["origin"]["lane"].is_object()
        || version
            .get("squashed")
            .is_some_and(|value| !value.is_null())
        || version
            .get("unrelated")
            .is_some_and(|value| !value.is_null()))
}

fn replacement(
    repository: &Repository,
    removed: &[String],
    distance: &Value,
    head_only: bool,
) -> io::Result<Option<String>> {
    if !head_only && let Some(common) = distance["common"].as_str() {
        return Ok(Some(common.to_owned()));
    }
    let mut current = repository.heads.current.clone();
    let mut seen = std::collections::HashSet::new();
    while seen.insert(current.clone()) && seen.len() <= 4096 {
        let version = outbound::read_object(&repository.objects, &current, "Version")?;
        let parents = version["parents"].as_array().ok_or_else(|| invalid("lane reset parents"))?;
        let parent = match parents.as_slice() {
            [] => return Ok(None),
            [parent] => parent.as_str().ok_or_else(|| invalid("lane reset parent"))?,
            _ => {
                return Err(diagnostics::error(format!(
                    "removeComponentVersions found multiple parents for a local (un-exported) version {current} of {}/{}",
                    repository.model["scope"].as_str().unwrap_or_default(),
                    repository.model["name"].as_str().unwrap_or_default(),
                )));
            }
        };
        if !removed
            .iter()
            .any(|hash| hash == parent)
        {
            return Ok(Some(parent.to_owned()));
        }
        parent.clone_into(&mut current);
    }
    Err(invalid("lane reset cyclic or oversized history"))
}

/// The published inherited-new-lane error applies only when no replacement can be found.
pub(super) fn validate_replacement(
    repository: &Repository,
    selection: &Selection,
    exported_on_new_lane: bool,
) -> io::Result<()> {
    if selection.next.is_some() || !exported_on_new_lane {
        return Ok(());
    }
    Err(diagnostics::error(format!(
        "fatal: unable to find a new head for \"{}/{}\".\nthis is because the lane {} is new so the remote doesn't have previous snaps of this component.\nalso, this component wasn't part of a fork, so it's impossible to find a previous snap in the original-lane.\nprobably this component landed here as part of a merge from another lane.\nit's impossible to leave the component in the .bitmap with a scope-name and without any version.\nplease either remove the component (bit remove) or remove the lane.",
        repository.model["scope"].as_str().unwrap_or_default(),
        repository.model["name"].as_str().unwrap_or_default(),
        repository.lane_name,
    )))
}

pub(super) fn distance(repository: &Repository, source: &str) -> io::Result<Value> {
    let mut heads = vec![source.to_owned()];
    heads.extend(repository.heads.baseline.iter().cloned());
    let records = super::history::records(repository, &heads)?;
    let mut distance = crate::merge_history::status::distance(
        &records,
        Some(source),
        repository.heads.baseline.as_deref(),
    )?;
    if source == repository.heads.baseline.as_deref().unwrap_or_default() {
        distance["common"] = Value::String(source.to_owned());
    }
    Ok(distance)
}

fn validate_selection(
    repository: &Repository,
    removed: &[String],
    head_only: bool,
) -> io::Result<()> {
    let identity = format!(
        "{}/{}",
        repository.model["scope"].as_str().unwrap_or_default(),
        repository.model["name"].as_str().unwrap_or_default(),
    );
    if removed.is_empty() {
        return Err(diagnostics::error(format!(
            "unable to untag {identity}, the component is not staged",
        )));
    }
    if head_only && !removed.contains(&repository.heads.current) {
        return Err(diagnostics::error(format!(
            "unable to reset {identity}, the head {} is exported",
            repository.heads.current,
        )));
    }
    Ok(())
}
