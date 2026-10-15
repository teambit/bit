//! Select only lane-origin Versions newer than the remote lane head.
use super::{MAX_OBJECTS, invalid, model};
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
    if hash != head && (origin["scope"] != scope || origin["name"] != name) {
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
