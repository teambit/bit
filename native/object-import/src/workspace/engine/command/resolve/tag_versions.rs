//! Compute semantic identities before allocating any Version object hashes.
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
    if params["hasTagData"] == true {
        return Err(invalid("tag requires ordinary version planning"));
    }
    let components = materials
        .iter()
        .map(|material| {
            let tags = material.model["versions"]
                .as_object()
                .ok_or_else(|| invalid("tag model versions"))?;
            let pending = next
                .get(&material.identity)
                .copied()
                .unwrap_or(&Value::Null);
            Ok(json!({"versions":tags.keys().collect::<Vec<_>>(),
            "isAutoTag":material.participation.automatic && !material.participation.selected,
            "isAutoAddedRoot":false,"enteredVersion":entered.get(&material.identity),
            "nextVersion":pending["version"],"nextPreRelease":pending["preRelease"]}))
        })
        .collect::<io::Result<Vec<_>>>()?;
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
                .ok_or_else(|| invalid("tag planned version"))?
                .to_owned(),
        );
    }
    if params["soft"] == true { Ok(()) } else { ranges::update(materials) }
}

mod ranges;

#[cfg(test)]
mod tests;
