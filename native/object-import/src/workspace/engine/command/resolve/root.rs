//! The workspace-root joins changed members and records provenance without becoming a dependency.

use super::{
    super::{capture, resolve_snapshot::Material},
    Retained, invalid, snap,
};
use serde_json::{Value, json};
use std::io;

const ASPECT: &str = "teambit.workspace/workspace-root";
const AUTO: &str = "snapshotAutoAddedWorkspaceRoot";

pub(super) fn include(
    retained: &mut Retained,
    captured: &[capture::Captured],
    selected: &mut Vec<String>,
) -> io::Result<bool> {
    if selected.is_empty()
        || retained.snap.is_none()
        || retained.tag.as_ref().is_some_and(|options| options.persist)
    {
        return Ok(false);
    }
    let Some(root) = target(&retained.record.context).cloned() else { return Ok(false) };
    let identity = root["identity"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| invalid("workspace-root identity"))?;
    if selected.iter().any(|id| id == identity) {
        return Ok(false);
    }
    let current = captured
        .iter()
        .find(|current| current.target.identity == identity)
        .ok_or_else(|| invalid("workspace-root capture absent"))?;
    let mut options =
        retained.snap.clone().ok_or_else(|| invalid("workspace-root snapshot options"))?;
    options.unmodified = false;
    if !snap::eligible(retained, current, &options)? {
        return Ok(false);
    }
    selected.push(identity.to_string());
    retained.record.context[AUTO] = json!(identity);
    Ok(true)
}

pub(super) fn added(retained: &Retained) -> Option<&str> {
    retained.record.context[AUTO].as_str()
}

fn target(context: &Value) -> Option<&Value> {
    context["targets"]
        .as_array()?
        .iter()
        .find(|target| target["directory"] == "." && target["locallyRemoved"] != true)
}

pub(super) fn provenance(retained: &Retained, materials: &mut [Material]) -> io::Result<()> {
    let root = target(&retained.record.context);
    let identity = root.and_then(|root| root["identity"].as_str());
    let root_in_batch = identity.is_some_and(|identity| {
        materials
            .iter()
            .any(|material| material.identity == identity)
    });
    for material in materials.iter_mut().filter(|material| !material.hidden) {
        let data = provenance_data(root, identity, root_in_batch, &material.identity)?;
        write(&mut material.version, data)?;
    }
    Ok(())
}

fn provenance_data(
    root: Option<&Value>,
    identity: Option<&str>,
    in_batch: bool,
    member: &str,
) -> io::Result<Value> {
    let (Some(root), Some(identity)) = (
        root,
        identity
            .map(str::trim)
            .filter(|id| !id.is_empty()),
    ) else {
        return Ok(json!({}));
    };
    if identity == member.trim() {
        return Ok(json!({"isRoot":true}));
    }
    let version = if in_batch {
        format!("__bit_pending_snapshot__:{identity}")
    } else {
        root["version"]
            .as_str()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .ok_or_else(|| invalid("workspace-root version"))?
            .to_string()
    };
    Ok(json!({"root":format!("{identity}@{version}")}))
}

fn write(version: &mut Value, data: Value) -> io::Result<()> {
    let extensions =
        version["extensions"].as_array_mut().ok_or_else(|| invalid("workspace-root extensions"))?;
    if let Some(extension) = extensions
        .iter_mut()
        .find(|extension| {
            crate::workspace::engine::client_status::config::is_extension_aspect(extension, ASPECT)
        })
    {
        extension["data"] = data;
    } else if data
        .as_object()
        .is_some_and(|data| !data.is_empty())
    {
        extensions.push(json!({"name":ASPECT,"config":{},"data":data}));
    }
    Ok(())
}

pub(super) fn report(retained: &Retained, materials: &[Material], result: &mut Value) {
    if let Some(root) = added(retained) {
        let version = materials
            .iter()
            .find(|material| material.identity == root)
            .and_then(|material| material.version_state.tagged_version.as_deref());
        result["autoAddedWorkspaceRoot"] =
            json!(version.map_or_else(|| root.to_string(), |version| format!("{root}@{version}")));
    }
}
