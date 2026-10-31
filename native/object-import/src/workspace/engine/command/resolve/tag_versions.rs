//! Compute semantic identities before allocating any Version object hashes.

pub(super) use ranges::update as update_ranges;

mod file;
mod ranges;
#[cfg(test)]
mod tests;

use super::super::{invalid, resolve_snapshot::Material};
use serde_json::{Value, json};
use std::{collections::HashMap, io};

pub(super) fn plan(
    materials: &mut [Material],
    params: &Value,
    entered: &Value,
    semver: &Value,
    next: &HashMap<String, &Value>,
) -> io::Result<()> {
    let components = components(materials, params, entered, next)?;
    let semver = file::semver(params.get("versionsFile"), semver)?;
    let mut params = params.clone();
    let object = params.as_object_mut().ok_or_else(|| invalid("tag version options"))?;
    object.remove("versionsFile");
    object.remove("autoAddedWorkspaceRoot");
    let output = crate::snapshot_transaction::apply(
        "snapshotFutureVersions",
        json!({"components":components,"params":params,"semver":semver}),
        &mut crate::snapshot_transaction::State::default(),
    )?;
    let versions = output["versions"].as_array().ok_or_else(|| invalid("tag planned versions"))?;
    if versions.len() != materials.len() {
        return Err(invalid("tag planned version count"));
    }
    for (material, version) in materials.iter_mut().zip(versions) {
        material.version_state.tagged_version = Some(
            version
                .as_str()
                .map(str::trim)
                .filter(|version| !version.is_empty())
                .ok_or_else(|| invalid("tag planned version"))?
                .to_owned(),
        );
    }
    if params["soft"] == true { Ok(()) } else { ranges::update(materials) }
}

fn components(
    materials: &[Material],
    params: &Value,
    entered: &Value,
    next: &HashMap<String, &Value>,
) -> io::Result<Vec<Value>> {
    materials
        .iter()
        .map(|material| {
            let tags = material.model["versions"]
                .as_object()
                .ok_or_else(|| invalid("tag model versions"))?;
            let all_tags: Vec<_> = tags
                .keys()
                .chain(
                    material.model["orphanedVersions"]
                        .as_object()
                        .into_iter()
                        .flat_map(serde_json::Map::keys),
                )
                .collect();
            let pending = next
                .get(&material.identity)
                .copied()
                .unwrap_or(&Value::Null);
            Ok(json!({"versions":all_tags,
            "isAutoTag":material.participation.automatic && !material.participation.selected,
            "isAutoAddedRoot":params["autoAddedWorkspaceRoot"] == material.identity,"enteredVersion":entered.get(&material.identity),
            "nextVersion":pending["version"],"nextPreRelease":pending["preRelease"],"tagData":file::for_component(params.get("versionsFile"),&material.identity,params["autoAddedWorkspaceRoot"] == material.identity)?}))
        })
        .collect::<io::Result<Vec<_>>>()
}
