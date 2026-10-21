//! The `importDetails` of an inbound receipt (`_getImportDetails`).
use super::{Target, invalid, write};
use crate::command_import;
use serde_json::{Value, json};
use sha1::Digest;
use std::{borrow::Cow, io, path::Path};

/// The remote model when transferred, or the validated local model when the
/// remote reports this component is already up to date.
pub(super) fn model<'a>(
    root: &Path,
    imported: &'a command_import::PreparedImport,
    scope: &str,
    name: &str,
) -> io::Result<Cow<'a, Value>> {
    if let Some(model) = imported.overlay
        .models()
        .into_iter()
        .find(|model| model["scope"] == scope && model["name"] == name)
    {
        return Ok(Cow::Borrowed(model));
    }
    let hash =
        crate::validate::hexadecimal(&sha1::Sha1::digest(format!("{scope}/{name}").as_bytes()));
    let model = local_object(root, &hash, "Component")?
        .ok_or_else(|| invalid("inbound existing local model"))?;
    if model["scope"] != scope || model["name"] != name {
        return Err(invalid("inbound existing local model identity"));
    }
    Ok(Cow::Owned(model))
}

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
    workspace: Option<&write::Prepared>,
    prefetched: &[Target],
) -> io::Result<Vec<Value>> {
    targets
        .iter()
        .map(|target| {
            let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound scope"))?;
            let model = model(root, imported, scope, &target.name)?;
            let id = format!("{scope}/{}", target.name);
            let conflicts = workspace.and_then(|workspace| workspace.conflicts(&id));
            let prefetched = prefetched
                .iter()
                .any(|root| root.scope == target.scope && root.name == target.name);
            detail(root, scope, target, model.as_ref(), imported, conflicts, prefetched)
        })
        .collect()
}

fn detail(
    root: &Path,
    scope: &str,
    target: &Target,
    model: &Value,
    imported: &command_import::PreparedImport,
    conflicts: Option<&[String]>,
    prefetched: bool,
) -> io::Result<Value> {
    let versions = model["versions"].as_object().ok_or_else(|| invalid("inbound versions"))?;
    let previous = previous_versions(root, scope, &target.name)?;
    let added = versions
        .keys()
        .filter(|key| !prefetched && !previous.contains(*key))
        .cloned()
        .collect::<Vec<_>>();
    let status = match (added.is_empty(), previous.is_empty()) {
        (true, _) => "up to date",
        (false, true) => "added",
        (false, false) => "updated",
    };
    let head = if model["head"].is_null() && crate::merge_history::hash(&target.version).is_ok() {
        target.version.clone()
    } else {
        head_as_tag_or_hash(model)?
    };
    let latest = added.contains(&head).then_some(head);
    let files_status = conflicts.map(|paths| {
        paths
            .iter()
            .map(|path| (path.clone(), json!("manual")))
            .collect::<serde_json::Map<String, Value>>()
    });
    Ok(json!({"id":format!("{scope}/{}", target.name),"versions":added,
        "latestVersion":latest,"status":status,"filesStatus":files_status,"missingDeps":[],
        "deprecated":deprecated(root, model, imported)?,"removed":removed(root, target, model, imported)?}))
}

fn removed(
    root: &Path,
    target: &Target,
    model: &Value,
    imported: &command_import::PreparedImport,
) -> io::Result<bool> {
    let lane_head = super::remote::active_lane(root)?
        .and_then(|_| {
            crate::merge_history::hash(&target.version).is_ok().then_some(target.version.as_str())
        });
    let Some(head) = lane_head.or_else(|| model["head"].as_str()) else {
        return Ok(false);
    };
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
        .find(|extension| {
            extension["name"] == "teambit.component/remove"
                || extension["extensionId"] == "teambit.component/remove"
        });
    let Some(config) = aspect.map(|aspect| &aspect["config"]) else { return Ok(false) };
    if config["removed"] == true {
        return Ok(true);
    }
    if config
        .get("range")
        .is_some_and(|range| !range.is_null())
        || config
            .get("snaps")
            .is_some_and(|snaps| !snaps.is_null())
    {
        return Err(invalid("inbound remove range"));
    }
    Ok(false)
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
        &crate::scope_path(root).join("objects"),
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
    let directory = crate::scope_path(root).join("objects");
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
