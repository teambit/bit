//! Select only lane-origin Versions newer than the remote lane head.
use super::{ComponentContext, ComponentId, MAX_OBJECTS, exhaustive, invalid, model};
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

/// Keep the lane head and any preceding snaps made on this lane. A main-lane
/// parent is already on the component's home scope and does not need sending.
pub(super) fn lane_versions(
    dir: &Path,
    head: &str,
    previous_head: Option<&str>,
    scope: &str,
    name: &str,
) -> io::Result<Vec<String>> {
    let mut output = Vec::new();
    let mut pending = vec![head.to_owned()];
    let mut seen = HashSet::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) || Some(hash.as_str()) == previous_head {
            continue;
        }
        if seen.len() > MAX_OBJECTS {
            return Err(invalid("outbound lane version budget"));
        }
        if let Some(parents) = selected_parents(dir, &hash, head, scope, name)? {
            output.push(hash);
            pending.extend(parents.into_iter().rev());
        }
    }
    output.reverse();
    Ok(output)
}

fn selected_parents(
    dir: &Path,
    hash: &str,
    head: &str,
    scope: &str,
    name: &str,
) -> io::Result<Option<Vec<String>>> {
    let version = model::read_object(dir, hash, "Version")?;
    if version["unrelated"] == true || version["squashed"] == true {
        return Err(invalid("outbound rewritten lane history"));
    }
    let origin = &version["origin"]["lane"];
    let (same_lane, any_lane) = origin_lane_flags(origin, scope, name);
    if hash != head && !same_lane && !any_lane {
        return Ok(None);
    }
    let parents = version["parents"].as_array().ok_or_else(|| invalid("outbound lane parents"))?;
    parents
        .iter()
        .map(|parent| {
            let hash = parent.as_str().ok_or_else(|| invalid("outbound lane parent"))?;
            crate::merge_history::hash(hash)?;
            Ok(hash.to_owned())
        })
        .collect::<io::Result<Vec<_>>>()
        .map(Some)
}

fn origin_lane_flags(origin: &Value, scope: &str, name: &str) -> (bool, bool) {
    if let Some((orig_scope, orig_name)) = origin
        .as_str()
        .and_then(|raw| raw.split_once('/'))
    {
        let same = orig_scope == scope && orig_name == name;
        let any = !orig_scope.is_empty() && !orig_name.is_empty();
        return (same, any);
    }
    let same = origin["scope"] == scope && origin["name"] == name;
    let any = origin["scope"]
        .as_str()
        .is_some_and(|value| !value.is_empty())
        && origin["name"]
            .as_str()
            .is_some_and(|value| !value.is_empty());
    (same, any)
}

pub(super) fn selected_versions(
    context: &ComponentContext<'_>,
    id: &ComponentId<'_>,
    component: &Value,
    previous_head: Option<&str>,
    exhaustive: bool,
) -> io::Result<Vec<String>> {
    let dir = &context.loaded.dir;
    let mut versions = if context.input.options.head_only {
        vec![id.head.to_owned()]
    } else if exhaustive {
        exhaustive::all_lane_versions(dir, id.head, component["head"].as_str())?
    } else {
        lane_versions(dir, id.head, previous_head, context.scope, context.name)?
    };
    if context.input.options.fork_lane_new_scope
        && !versions
            .iter()
            .any(|hash| hash == id.head)
    {
        versions.push(id.head.to_owned());
    }
    Ok(versions)
}

/// The released importer fetches raw refs to filter Versions already on a file remote.
pub(super) fn missing_remote_head(host: &str, head: &str) -> io::Result<bool> {
    let bit_client_transfer::remotes::Remote::File(root) =
        bit_client_transfer::remotes::Remote::from_host(host)?
    else {
        return Ok(false);
    };
    match model::read_object(&root.join("objects"), head, "Version") {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}

pub(super) fn check_new_cross_scope_conflict(
    context: &ComponentContext<'_>,
    id: &ComponentId<'_>,
    component: &Value,
) -> io::Result<()> {
    if id.scope == context.scope
        || component["remotes"]
            .as_array()
            .is_some_and(|list| !list.is_empty())
        || component["head"].is_string()
    {
        return Ok(());
    }
    let Ok(host) = super::remote::configured_host(context.input, id.scope) else {
        return Ok(());
    };
    let bit_client_transfer::remotes::Remote::File(root) =
        bit_client_transfer::remotes::Remote::from_host(&host)?
    else {
        return Ok(());
    };
    let Ok(bytes) = std::fs::read(root.join("index.json")) else {
        return Ok(());
    };
    let index: Value = crate::parse_jsonc(&bytes).map_err(io::Error::other)?;
    if index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| id.matches(row) && row["isSymlink"] != true)
        })
    {
        return Err(invalid("outbound cross-scope new component conflict"));
    }
    Ok(())
}
