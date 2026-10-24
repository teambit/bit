//! Select every tracked lane/main component and its complete Version ancestry.
use super::{Loaded, MAX_OBJECTS, Prepare, invalid, model};
use serde_json::{Value, json};
use std::{collections::HashSet, fs, io, path::Path};

/// `listNonNewComponentsIds()` also selects tracked main components absent
/// from the Lane object when `ExportCmd` includes non-staged versions.
pub(super) fn workspace_entries(
    input: &Prepare,
    loaded: &Loaded,
    lane_rows: &[Value],
) -> io::Result<Vec<Value>> {
    let bitmap = crate::recovery::jsonc::parse(&fs::read(input.root.join(".bitmap"))?)?;
    let entries = bitmap.as_object().ok_or_else(|| invalid("outbound lane bitmap"))?;
    let indexed =
        loaded.index["components"].as_array().ok_or_else(|| invalid("outbound component index"))?;
    let mut extra = Vec::new();
    for entry in entries.values() {
        let (Some(name), Some(scope), Some(_)) =
            (entry["name"].as_str(), entry["scope"].as_str(), entry["version"].as_str())
        else {
            continue;
        };
        let id = json!({"scope":scope,"name":name});
        if lane_rows
            .iter()
            .any(|row| row["id"] == id)
        {
            continue;
        }
        let row = indexed
            .iter()
            .find(|row| row["id"] == id)
            .ok_or_else(|| invalid("outbound non-staged component model missing"))?;
        let hash = row["hash"].as_str().ok_or_else(|| invalid("outbound model hash"))?;
        let component = model::read_object(&loaded.dir, hash, "Component")?;
        let Some(head) = component["head"].as_str() else { continue };
        extra.push(json!({"id":id,"head":head}));
    }
    Ok(extra)
}

/// `getAllVersionHashes` starts at the lane head and walks its complete
/// ancestry; `addMainHeadIfPossible` adds an independently present main head.
pub(super) fn all_lane_versions(
    dir: &Path,
    head: &str,
    main_head: Option<&str>,
) -> io::Result<Vec<String>> {
    let mut output = Vec::new();
    let mut pending = vec![head.to_owned()];
    let mut seen = HashSet::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) {
            continue;
        }
        if seen.len() > MAX_OBJECTS {
            return Err(invalid("outbound lane history budget"));
        }
        let version = model::read_object(dir, &hash, "Version")?;
        let parents =
            version["parents"].as_array().ok_or_else(|| invalid("outbound lane parents"))?;
        for parent in parents.iter().rev() {
            let parent = parent.as_str().ok_or_else(|| invalid("outbound lane parent"))?;
            crate::merge_history::hash(parent)?;
            pending.push(parent.to_owned());
        }
        output.push(hash);
    }
    output.reverse();
    if let Some(main) = main_head.filter(|main| !seen.contains(*main)) {
        crate::merge_history::hash(main)?;
        if dir
            .join(&main[..2])
            .join(&main[2..])
            .exists()
        {
            output.push(main.to_owned());
        }
    }
    Ok(output)
}
