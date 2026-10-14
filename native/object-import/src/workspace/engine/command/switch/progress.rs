use super::invalid;
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

pub(in crate::workspace::engine::command) fn import_count(
    root: &Path,
    context: &Value,
    targets: &[Value],
) -> io::Result<usize> {
    let additions = context["lane"]["addedTargets"]
        .as_array()
        .ok_or_else(|| invalid("switch addition count"))?
        .len();
    if context["lane"]["switchId"]["name"] == "main" {
        return Ok(targets.len() + additions);
    }
    if context["lane"]["switchFetched"] == true {
        return context["lane"]["switchLaneHeads"]
            .as_object()
            .map(serde_json::Map::len)
            .ok_or_else(|| invalid("switch fetched head count"));
    }
    let staged = match std::fs::read_to_string(root.join(".bit/staged-snaps")) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(targets.len() + additions);
        }
        Err(error) => return Err(error),
    };
    let local = staged
        .lines()
        .map(str::trim)
        .collect::<HashSet<_>>();
    Ok(staged_count(context, targets, &local))
}

fn staged_count(context: &Value, targets: &[Value], local: &HashSet<&str>) -> usize {
    let new_imports = context["lane"]["addedTargets"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|target| {
            target["version"]
                .as_str()
                .is_none_or(|version| !local.contains(version))
        })
        .count();
    new_imports
        + targets
            .iter()
            .filter(|target| {
                let identity = target["identity"].as_str().unwrap_or_default();
                let version = target["switchVersion"].as_str().unwrap_or_default();
                context["lane"]["switchLaneHeads"].get(identity).is_none()
                    || !local.contains(version)
            })
            .count()
}
