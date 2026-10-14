use super::{Material, invalid};
use serde_json::{Value, json};
use std::{collections::HashMap, io};

// Workspace-level range policy is guarded by context eligibility. This retained
// projection carries the canonical stored/current resolver prefix.
pub(super) fn update(materials: &mut [Material]) -> io::Result<()> {
    let versions = materials
        .iter()
        .map(|material| {
            Ok((
                material.identity.clone(),
                material.version_state.tagged_version
                    .clone()
                    .ok_or_else(|| invalid("tag missing semantic version"))?,
            ))
        })
        .collect::<io::Result<HashMap<_, _>>>()?;
    for material in materials {
        let prefix = prefix(&material.version)?;
        let Some(prefix) = prefix else { continue };
        update_dependencies(&mut material.version, prefix, &versions)?;
    }
    Ok(())
}

fn update_dependencies(
    version: &mut Value,
    prefix: char,
    versions: &HashMap<String, String>,
) -> io::Result<()> {
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(rows) = version.get_mut(field) else { continue };
        for row in rows.as_array_mut().ok_or_else(|| invalid("tag dependency rows"))? {
            let id = &row["id"];
            let scope = id["scope"].as_str().ok_or_else(|| invalid("tag dependency scope"))?;
            let name = id["name"].as_str().ok_or_else(|| invalid("tag dependency name"))?;
            if let Some(version) = versions.get(&format!("{scope}/{name}")) {
                row["versionRange"] = json!(format!("{prefix}{version}"));
            }
        }
    }
    Ok(())
}

fn prefix(version: &Value) -> io::Result<Option<char>> {
    let Some(rows) = version["extensions"].as_array() else { return Ok(None) };
    let value = rows
        .iter()
        .find(|row| row["name"] == "teambit.dependencies/dependency-resolver")
        .map(|row| &row["data"]["componentRangePrefix"]);
    match value.and_then(Value::as_str) {
        Some("^") => Ok(Some('^')),
        Some("~") => Ok(Some('~')),
        None | Some("" | "+") => Ok(None),
        _ => Err(invalid("tag unsupported dependency range prefix")),
    }
}
