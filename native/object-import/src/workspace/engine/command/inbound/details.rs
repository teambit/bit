//! The `importDetails` of an inbound receipt (`_getImportDetails`).
use super::{Target, invalid};
use crate::command_import;
use serde_json::{Value, json};
use sha1::Digest;
use std::{io, path::Path};

pub(super) fn head_as_tag_or_hash(model: &Value) -> io::Result<String> {
    let head = model["head"].as_str().ok_or_else(|| invalid("inbound model head"))?;
    Ok(model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .rev()
                .find(|(_, hash)| hash.as_str() == Some(head))
        })
        .map_or_else(|| head.to_owned(), |(tag, _)| tag.clone()))
}

/// `_getImportDetails`: per target, the tags the import added, its status,
/// the head when it is new, and whether the component is deprecated.
pub(super) fn details(
    root: &Path,
    targets: &[Target],
    imported: &command_import::PreparedImport,
) -> io::Result<Vec<Value>> {
    let models = imported.overlay.models();
    targets
        .iter()
        .map(|target| {
            let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound scope"))?;
            let model = models
                .iter()
                .copied()
                .find(|model| model["scope"] == scope && model["name"] == target.name)
                .ok_or_else(|| invalid("inbound imported model absent"))?;
            detail(root, scope, target, model, imported)
        })
        .collect()
}

fn detail(
    root: &Path,
    scope: &str,
    target: &Target,
    model: &Value,
    imported: &command_import::PreparedImport,
) -> io::Result<Value> {
    let versions = model["versions"].as_object().ok_or_else(|| invalid("inbound versions"))?;
    let previous = previous_versions(root, scope, &target.name)?;
    let added = versions
        .keys()
        .filter(|key| !previous.contains(*key))
        .cloned()
        .collect::<Vec<_>>();
    let status = match (added.is_empty(), previous.is_empty()) {
        (true, _) => "up to date",
        (false, true) => "added",
        (false, false) => "updated",
    };
    let head = head_as_tag_or_hash(model)?;
    let latest = added.contains(&head).then_some(head);
    Ok(json!({"id":format!("{scope}/{}", target.name),"versions":added,
        "latestVersion":latest,"status":status,"filesStatus":null,"missingDeps":[],
        "deprecated":deprecated(root, model, imported)?,"removed":false}))
}

/// `ModelComponent.isDeprecated`: the legacy flag, else the deprecation aspect
/// of the head Version, imported or local; a head neither holds is not
/// deprecated. A deprecated version `range` needs semver and declines.
fn deprecated(
    root: &Path,
    model: &Value,
    imported: &command_import::PreparedImport,
) -> io::Result<bool> {
    if model["deprecated"] == true {
        return Ok(true);
    }
    let Some(head) = model["head"].as_str() else { return Ok(false) };
    let local;
    let version = match imported.overlay.read(head, "Version")? {
        Some(version) => version,
        None => match local_object(root, head, "Version")? {
            Some(version) => {
                local = version;
                &local
            }
            None => return Ok(false),
        },
    };
    let aspect = version["extensions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|extension| extension["name"] == "teambit.component/deprecation");
    let Some(config) = aspect.map(|aspect| &aspect["config"]) else { return Ok(false) };
    if config["deprecate"] == true {
        return Ok(true);
    }
    if config
        .get("range")
        .is_some_and(|range| !range.is_null())
    {
        return Err(invalid("inbound deprecation range"));
    }
    Ok(false)
}

/// A local object of the workspace scope, or `None` when it is absent.
pub(super) fn local_object(root: &Path, hash: &str, kind: &str) -> io::Result<Option<Value>> {
    let identity = crate::merge_history::hash(hash)?;
    let mut total = 0;
    let raw = match crate::checkout::repository::read(
        &root.join(".bit/objects"),
        identity,
        32 * 1024 * 1024,
        &mut total,
    ) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let (_, body) = crate::checkout::repository::split(&raw, identity, kind)?;
    serde_json::from_slice(body).map(Some).map_err(io::Error::other)
}

fn previous_versions(root: &Path, scope: &str, name: &str) -> io::Result<Vec<String>> {
    let hash =
        crate::validate::hexadecimal(&sha1::Sha1::digest(format!("{scope}/{name}").as_bytes()));
    let directory = root.join(".bit/objects");
    let mut total = 0;
    let raw = match crate::checkout::repository::read(
        &directory,
        crate::merge_history::hash(&hash)?,
        32 * 1024 * 1024,
        &mut total,
    ) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let (_, body) =
        crate::checkout::repository::split(&raw, crate::merge_history::hash(&hash)?, "Component")?;
    let model: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
    Ok(model["versions"]
        .as_object()
        .map_or_else(Vec::new, |versions| versions.keys().cloned().collect()))
}
