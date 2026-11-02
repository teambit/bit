//! Dependency version range prefix [`update`] across co-tagged [`Material`] workspace components.

use super::{Material, invalid};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

// Workspace-level range policy is guarded by context eligibility. This retained
// projection carries the canonical stored/current resolver prefix.
/// Updates dependency version ranges across co-tagged `materials` using each component's range prefix.
#[inline]
pub(in super::super) fn update(materials: &mut [Material]) -> io::Result<()> {
    let mut versions = HashMap::with_capacity(materials.len());
    for material in materials.iter() {
        let identity = material.identity.trim().to_owned();
        let version = material.version_state.tagged_version
            .as_deref()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| invalid("tag missing semantic version"))?;
        if versions.insert(identity, version).is_some() {
            return Err(invalid("tag duplicate material identity"));
        }
    }
    for material in materials {
        let Some(prefix) = prefix(&material.version)? else { continue };
        let pinned = super::super::super::resolve_snapshot::pinned_dependencies(&material.version);
        update_dependencies(&mut material.version, prefix, &versions, &pinned)?;
    }
    Ok(())
}

/// Updates `versionRange` fields on non-pinned dependencies in `version` that appear in `versions`.
#[inline]
fn update_dependencies(
    version: &mut Value,
    prefix: char,
    versions: &HashMap<String, String>,
    pinned: &HashSet<String>,
) -> io::Result<()> {
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(rows) = version.get_mut(field) else { continue };
        for row in rows.as_array_mut().ok_or_else(|| invalid("tag dependency rows"))? {
            let (scope, name) =
                crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(
                    row,
                )
                .ok_or_else(|| invalid("tag dependency id"))?;
            let identity = format!("{scope}/{name}");
            if pinned.contains(&identity) {
                continue;
            }
            if let Some(version) = versions.get(&identity) {
                row["versionRange"] = json!(format!("{prefix}{version}"));
            }
        }
    }
    Ok(())
}

#[inline]
fn prefix(version: &Value) -> io::Result<Option<char>> {
    let Some(rows) = version["extensions"].as_array() else { return Ok(None) };
    let value = rows
        .iter()
        .find(|row| {
            crate::workspace::engine::client_status::config::is_extension_aspect(
                row,
                "teambit.dependencies/dependency-resolver",
            )
        })
        .map(|row| &row["data"]["componentRangePrefix"]);
    match value.and_then(Value::as_str).map(str::trim) {
        Some("^") => Ok(Some('^')),
        Some("~") => Ok(Some('~')),
        None | Some("" | "+") => Ok(None),
        _ => Err(invalid("tag unsupported dependency range prefix")),
    }
}
