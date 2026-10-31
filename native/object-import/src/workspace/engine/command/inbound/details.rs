//! The `importDetails` of an inbound receipt (`_getImportDetails`).
use super::{Target, invalid, write};
use crate::{command_import, workspace::engine::client_status::config::is_extension_aspect};
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
    let model = local_component_model(root, scope, name)?
        .ok_or_else(|| invalid("inbound existing local model"))?;
    let model_scope = model["scope"].as_str().unwrap_or_default();
    if (!model_scope.is_empty() && model_scope != scope) || model["name"] != name {
        return Err(invalid("inbound existing local model identity"));
    }
    Ok(Cow::Owned(model))
}

pub(super) fn head_as_tag_or_hash(model: &Value) -> io::Result<String> {
    let head = model["head"].as_str().ok_or_else(|| invalid("inbound model head"))?;
    Ok(model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(|versions| versions.iter().rev())
        .find(|(_, hash)| hash.as_str() == Some(head))
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
    if model
        .get("versions")
        .is_some_and(|val| !val.is_null() && !val.is_object())
    {
        return Err(invalid("inbound versions"));
    }
    let previous = previous_versions(root, scope, &target.name)?;
    let added = model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(serde_json::Map::keys)
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
        .find(|ext| is_extension_aspect(ext, "teambit.component/remove"));
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
        .find(|ext| is_extension_aspect(ext, "teambit.component/deprecation"));
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

fn local_component_model(root: &Path, scope: &str, name: &str) -> io::Result<Option<Value>> {
    let scope_dir = crate::scope_path(root);
    for hash in candidate_component_hashes(&scope_dir, scope, name) {
        if let Some(model) = local_object(root, &hash, "Component")? {
            return Ok(Some(model));
        }
    }
    Ok(None)
}

pub(crate) fn candidate_component_hashes(scope_dir: &Path, scope: &str, name: &str) -> Vec<String> {
    let mut hashes = indexed_component_hashes(scope_dir, scope, name);
    for candidate in [format!("{scope}/{name}"), name.to_owned()] {
        let hash = crate::validate::hexadecimal(&sha1::Sha1::digest(candidate.as_bytes()));
        if !hashes.contains(&hash) {
            hashes.push(hash);
        }
    }
    hashes
}

fn indexed_component_hashes(scope_dir: &Path, scope: &str, name: &str) -> Vec<String> {
    let Ok(bytes) = std::fs::read(scope_dir.join("index.json")) else { return Vec::new() };
    let Ok(index) = serde_json::from_slice::<Value>(&bytes) else { return Vec::new() };
    index
        .as_array()
        .or_else(|| index["components"].as_array())
        .into_iter()
        .flatten()
        .filter(|row| {
            let row_scope = row["id"]["scope"].as_str().unwrap_or_default();
            row["isSymlink"] != true
                && row["id"]["name"].as_str() == Some(name)
                && (row_scope == scope || row_scope.is_empty())
        })
        .filter_map(|row| {
            row["hash"]
                .as_str()
                .filter(|val| !val.is_empty())
                .map(str::to_owned)
        })
        .collect()
}

fn previous_versions(root: &Path, scope: &str, name: &str) -> io::Result<Vec<String>> {
    let Some(model) = local_component_model(root, scope, name)? else {
        return Ok(Vec::new());
    };
    Ok(model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(serde_json::Map::keys)
        .cloned()
        .collect())
}
