use super::{Options, Repository, Selection, invalid};
use serde_json::{Value, json};
use std::{cmp::Ordering, collections::HashSet, io};

pub(super) fn resolve(
    options: &Options,
    selection: &Selection<'_>,
    repository: &mut Repository,
) -> io::Result<String> {
    let model = selection.model.ok_or_else(|| invalid("command checkout model"))?;
    if let Some(version) = selection.target["switchVersion"].as_str() {
        return Ok(version.to_owned());
    }
    let to = options.to.as_deref().ok_or_else(|| invalid("command checkout target"))?;
    if to == "reset" {
        return selection.target["version"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| invalid("command reset version"));
    }
    if to == "main" {
        return head(model).map(str::to_owned);
    }
    if matches!(to, "head" | "latest")
        && let Some(head) = selection.lane_head
    {
        return Ok(head.to_owned());
    }
    if let Some(count) = to.strip_prefix("head~") {
        return ancestor(model, count.parse().map_err(io::Error::other)?, repository);
    }
    if to == "latest"
        && let Some(tag) = latest(model, selection.semver)?
    {
        return Ok(tag);
    }
    if matches!(to, "head" | "latest") {
        return recent(selection, repository);
    }
    explicit(model, to, repository)
}

fn explicit(model: &Value, to: &str, repository: &mut Repository) -> io::Result<String> {
    if short(to) && has(model, to, repository)? {
        return repository.resolve_short(to);
    }
    Ok(to.to_owned())
}

pub(in crate::workspace::engine::command) fn reference(
    model: &Value,
    version: &str,
) -> io::Result<String> {
    for field in ["orphanedVersions", "versions"] {
        if let Some(reference) = model[field].get(version) {
            let reference = reference.as_str().ok_or_else(|| invalid("command tag reference"))?;
            crate::merge_history::hash(reference)?;
            return Ok(reference.to_owned());
        }
    }
    crate::merge_history::hash(version)?;
    Ok(version.to_owned())
}

fn head(model: &Value) -> io::Result<&str> {
    model["head"].as_str().ok_or_else(|| invalid("command model head"))
}

pub(in crate::workspace::engine::command) fn label(model: &Value, hash: &str) -> String {
    for field in ["versions", "orphanedVersions"] {
        if let Some(tags) = model[field].as_object()
            && let Some((tag, _)) = tags
                .iter()
                .rev()
                .find(|(_, value)| value.as_str() == Some(hash))
        {
            return tag.clone();
        }
    }
    hash.to_owned()
}

fn latest(model: &Value, semver: &Value) -> io::Result<Option<String>> {
    let tags = model["versions"].as_object().ok_or_else(|| invalid("command model tags"))?;
    let mut latest: Option<&str> = None;
    for tag in tags.keys() {
        let grammar =
            semver[tag].get("version").ok_or_else(|| invalid("command tag semver grammar"))?;
        let newer = latest
            .map(|previous| {
                crate::config_merge::compare_versions(grammar, &semver[previous]["version"])
            })
            .transpose()?
            .is_none_or(|order| order == Ordering::Greater);
        if newer {
            latest = Some(tag);
        }
    }
    Ok(latest.map(str::to_owned))
}

fn recent(selection: &Selection<'_>, repository: &mut Repository) -> io::Result<String> {
    let model = selection.model.ok_or_else(|| invalid("command model missing"))?;
    let local = model["head"].as_str();
    let Some(remote) = selection.remote_head else {
        return Ok(label(model, head(model)?));
    };
    let Some(local) = local else {
        return Ok(remote.to_owned());
    };
    if local == remote {
        return Ok(label(model, local));
    }
    let rows = records(&[local, remote], repository)?;
    let distance = crate::merge_history::status::distance(&rows, Some(local), Some(remote))?;
    if distance["noCommon"] == true {
        return Err(invalid("command unrelated checkout histories"));
    }
    let ahead = distance["targetOnly"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty());
    Ok(label(model, if ahead { remote } else { local }))
}

pub(super) fn has(model: &Value, version: &str, repository: &mut Repository) -> io::Result<bool> {
    if model["versions"].get(version).is_some() || model["orphanedVersions"].get(version).is_some()
    {
        return Ok(true);
    }
    if crate::merge_history::hash(version).is_err() && !short(version) {
        return Ok(false);
    }
    let Some(head) = model["head"].as_str() else {
        return Ok(false);
    };
    let rows = records(&[head], repository)?;
    Ok(rows
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row["hash"]
                        .as_str()
                        .is_some_and(|hash| hash.starts_with(version))
                })
        }))
}

fn ancestor(model: &Value, count: usize, repository: &mut Repository) -> io::Result<String> {
    if count == 0 || count > 4096 {
        return Err(invalid("command checkout ancestor count"));
    }
    let mut hash = head(model)?.to_owned();
    for _ in 0..count {
        let version = repository.read(&hash, "Version")?;
        parents(&version)?
            .first()
            .ok_or_else(|| invalid("command checkout ancestor missing"))?
            .as_str()
            .ok_or_else(|| invalid("command checkout parent"))?
            .clone_into(&mut hash);
    }
    Ok(label(model, &hash))
}

fn parents(version: &Value) -> io::Result<&Vec<Value>> {
    if version
        .get("unrelated")
        .is_some_and(|value| !value.is_null())
        || version
            .get("squashed")
            .is_some_and(|value| !value.is_null())
    {
        return Err(invalid("command checkout complex history"));
    }
    version["parents"].as_array().ok_or_else(|| invalid("command checkout parents"))
}

fn records(heads: &[&str], repository: &mut Repository) -> io::Result<Value> {
    let mut pending = heads
        .iter()
        .map(|hash| (*hash).to_owned())
        .collect::<Vec<_>>();
    let mut seen = HashSet::new();
    let mut rows = Vec::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) {
            continue;
        }
        if seen.len() > 4096 {
            return Err(invalid("command checkout history limit"));
        }
        let version = repository.read(&hash, "Version")?;
        let parents = parents(&version)?;
        if parents.len() > 16 {
            return Err(invalid("command checkout parent limit"));
        }
        for parent in parents {
            pending.push(
                parent
                    .as_str()
                    .ok_or_else(|| invalid("command checkout parent hash"))?
                    .to_owned(),
            );
        }
        rows.push(json!({"hash":hash,"parents":parents}));
    }
    Ok(Value::Array(rows))
}

fn short(version: &str) -> bool {
    (3..40).contains(&version.len()) && version.bytes().all(|byte| byte.is_ascii_hexdigit())
}
