//! Preserve released object descriptions and decline unqualified asynchronous report ordering.
use super::repository::{Object, identity, text, unsupported};
use std::{collections::BTreeMap, io};

pub(super) fn preflight(objects: &BTreeMap<String, Object>, deleted: &[String]) -> io::Result<()> {
    if objects
        .values()
        .filter(|object| object.kind == "Component")
        .count()
        > 1
        || deleted.len() > 1
    {
        return Err(unsupported("verbose multiple-object report ordering"));
    }
    Ok(())
}
pub(super) fn deleted(
    objects: &BTreeMap<String, Object>,
    hashes: &[String],
) -> io::Result<Vec<String>> {
    hashes
        .iter()
        .map(|hash| {
            let trimmed = hash.trim();
            let object = objects
                .get(trimmed)
                .ok_or_else(|| unsupported("verbose deleted object missing"))?;
            description(trimmed, object)
        })
        .collect()
}
fn description(hash: &str, object: &Object) -> io::Result<String> {
    let hash = hash.trim();
    let kind = object.kind.as_str();
    let constructor = if kind == "Component" { "ModelComponent" } else { kind };
    let value = &object.value;
    let id = match kind {
        "Source" | "Version" => String::new(),
        "Component" | "Lane" => identity(value)?,
        "ScopeMeta" | "Symlink" => text(&value["name"])?.into(),
        "VersionHistory" => format!("{}:VersionHistory", identity(value)?),
        "LaneHistory" => format!("{}:LaneHistory", text(&value["laneHash"])?),
        _ => return Err(unsupported("verbose object identity")),
    };
    Ok(format!("ref {hash} {constructor} {kind} {id}"))
}
