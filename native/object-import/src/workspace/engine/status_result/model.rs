use super::{Request, invalid, push};
use serde_json::{Map, Value, json};
use std::{cmp::Ordering, collections::HashSet, io};

pub(super) fn append(output: &mut Value, model: &Value, request: &Request) -> io::Result<()> {
    let identity = identity(model)?;
    let history = request.histories
        .iter()
        .find(|row| row["identity"] == identity)
        .ok_or_else(|| invalid("status result history"))?;
    let source = refs(&history["status"], "sourceOnly")?;
    let merge = &history["merge"];
    if history["status"]["noCommon"] != false || merge["noCommon"] != false {
        return Err(invalid("status unrelated history requires canonical errors"));
    }
    let versions = tags(model, "versions")?;
    unique_refs(versions)?;
    let target = request.targets
        .iter()
        .find(|target| target.identity == identity);
    if target.is_some_and(|target| target.version.is_empty()) {
        return Err(invalid("status out of sync bitmap requires canonical persistence"));
    }
    let staged = if target.is_some() { !source.is_empty() } else { local(model) };
    if staged {
        let labels = local_labels(model, history)?;
        push(output, "stagedComponents", json!({"id":identity,"versions":labels}));
    }
    if let Some(target) = target {
        tracked(output, model, history, target, &request.semver)?;
    }
    Ok(())
}
fn tracked(
    output: &mut Value,
    model: &Value,
    history: &Value,
    target: &super::Target,
    semver: &Value,
) -> io::Result<()> {
    let head = history["laneHead"]
        .as_str()
        .or_else(|| model["head"].as_str())
        .ok_or_else(|| invalid("status model missing head"))?;
    if history["laneHead"].is_null()
        && !tags(model, "versions")?
            .values()
            .any(|value| value.as_str() == Some(head))
    {
        push(output, "snappedComponents", json!(target.identity));
    }
    let distance = &history["merge"];
    if !refs(distance, "sourceOnly")?.is_empty() && !refs(distance, "targetOnly")?.is_empty() {
        push(output, "mergePendingComponents", json!(target.identity));
    } else if target.invalid.is_none() {
        outdated(output, model, history, target, semver)?;
    }
    Ok(())
}

fn local(model: &Value) -> bool {
    model["state"]["versions"]
        .as_object()
        .is_some_and(|versions| {
            versions
                .values()
                .any(|version| version["local"] == true)
        })
}
fn local_labels(model: &Value, history: &Value) -> io::Result<Vec<String>> {
    let mut refs = refs(&history["status"], "sourceOnly")?.to_vec();
    let heads = match model["detachedHeads"].get("heads") {
        None => &[][..],
        Some(value) => value
            .as_array()
            .ok_or_else(|| invalid("status detached heads"))?
            .as_slice(),
    };
    if !heads.is_empty() {
        for value in self::refs(&history["merge"], "sourceOnly")? {
            if !refs.contains(value) {
                refs.push(value.clone());
            }
        }
    }
    refs.drain(..)
        .map(|value| {
            let hash = value.as_str().ok_or_else(|| invalid("status local ref"))?;
            label(model, hash)
        })
        .collect()
}
fn outdated(
    output: &mut Value,
    model: &Value,
    history: &Value,
    target: &super::Target,
    semver: &Value,
) -> io::Result<()> {
    let head = history["laneHead"]
        .as_str()
        .or_else(|| model["head"].as_str())
        .ok_or_else(|| invalid("status head"))?;
    let local = label(model, head)?;
    // setDivergeData retains the workspace-source distance established by staging.
    let remote_ahead = !refs(&history["status"], "targetOnly")?.is_empty();
    let latest = if remote_ahead {
        label(model, history["remoteHead"].as_str().ok_or_else(|| invalid("status remote head"))?)?
    } else {
        local.clone()
    };
    let outdated = latest != local || greater(model, &local, &target.version, semver)?;
    if outdated {
        let mut entry = json!({"id":target.identity,"headVersion":latest});
        if let Some(version) = latest_tag(model, semver)? {
            entry["latestVersion"] = json!(version);
        }
        push(output, "outdatedComponents", entry);
    }
    Ok(())
}
fn greater(model: &Value, latest: &str, current: &str, semver: &Value) -> io::Result<bool> {
    let left = semver.get(latest).ok_or_else(|| invalid("status missing semver grammar"))?;
    let right = semver.get(current).ok_or_else(|| invalid("status missing semver grammar"))?;
    if let (Some(left), Some(right)) = (left.get("version"), right.get("version")) {
        return Ok(crate::config_merge::compare_versions(left, right)? == Ordering::Greater);
    }
    Ok(reference(model, latest)? != reference(model, current)?)
}
fn latest_tag<'a>(model: &'a Value, semver: &Value) -> io::Result<Option<&'a str>> {
    let mut latest = None;
    for version in tags(model, "versions")?.keys() {
        let grammar =
            semver[version].get("version").ok_or_else(|| invalid("status tag grammar"))?;
        let newer = match latest {
            None => true,
            Some(previous) => {
                crate::config_merge::compare_versions(grammar, &semver[previous]["version"])?
                    == Ordering::Greater
            }
        };
        if newer {
            latest = Some(version.as_str());
        }
    }
    Ok(latest)
}
fn reference(model: &Value, version: &str) -> io::Result<String> {
    for field in ["orphanedVersions", "versions"] {
        if let Some(value) = model[field].get(version) {
            return value
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("status ref"));
        }
    }
    Ok(version.to_owned())
}
fn label(model: &Value, hash: &str) -> io::Result<String> {
    for field in ["versions", "orphanedVersions"] {
        if let Some(versions) = model[field].as_object()
            && let Some((tag, _)) = versions
                .iter()
                .rev()
                .find(|(_, value)| value.as_str() == Some(hash))
        {
            return Ok(tag.clone());
        }
    }
    Ok(hash.to_owned())
}
fn tags<'a>(model: &'a Value, field: &str) -> io::Result<&'a Map<String, Value>> {
    model[field].as_object().ok_or_else(|| invalid("status model tags"))
}
fn refs<'a>(distance: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    distance[field]
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("status distance refs"))
}
fn unique_refs(versions: &Map<String, Value>) -> io::Result<()> {
    let mut refs = HashSet::new();
    for value in versions.values() {
        let value = value.as_str().ok_or_else(|| invalid("status tag ref"))?;
        if !refs.insert(value) {
            return Err(invalid("status duplicate tag aliases require canonical lookup cache"));
        }
    }
    Ok(())
}
pub(super) fn identity(model: &Value) -> io::Result<String> {
    let scope = model["scope"].as_str().ok_or_else(|| invalid("status scope"))?;
    let name = model["name"].as_str().ok_or_else(|| invalid("status name"))?;
    Ok(format!("{scope}/{name}"))
}
