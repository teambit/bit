//! `RemoveMain.getDeletedDepsToPinToMain` ([`Pin`]) for a captured workspace-only [`DependencyComponent`] graph.

#[cfg(test)]
mod tests;

use super::{FrozenObject, component_remove::Selected, freeze, invalid, outbound};
use node_semver::Version;
use serde_json::Value;
use std::{collections::HashSet, fs, io, path::Path};

/// Workspace component identity, package name, and direct dependency list for deletion pinning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DependencyComponent {
    pub identity: String,
    pub package_name: String,
    pub dependencies: Vec<String>,
}

/// Deletion pinning decision for a lane component referenced by retained workspace dependents.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Decision {
    pub(super) pin: Option<Pin>,
    pub(super) loaded: bool,
}

/// Package name and `main` version to pin in dependent workspace components upon lane deletion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pin {
    pub package_name: String,
    pub version: String,
}

/// Compute the [`DependencyComponent`] [`Pin`] [`Decision`] when deleting [`Selected`] `selected` at [`Path`] `root` on a lane.
pub(super) fn plan(
    root: &Path,
    bitmap: &Value,
    selected: &Selected,
    components: Option<&[DependencyComponent]>,
    objects: &mut Vec<FrozenObject>,
) -> io::Result<Decision> {
    let Some(components) = components else {
        return Ok(Decision::default());
    };
    let identity = format!(
        "{}@{}",
        selected.identity.trim(),
        selected.version
            .as_deref()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .ok_or_else(|| invalid("lane component version"))?,
    );
    validate_graph(bitmap, components)?;
    if !components
        .iter()
        .any(|component| {
            component.identity.trim() != identity
                && component.dependencies
                    .iter()
                    .any(|dep| dep.trim() == identity)
        })
    {
        return Ok(Decision::default());
    }
    let target = components
        .iter()
        .find(|component| component.identity.trim() == identity)
        .ok_or_else(|| invalid("deleted component is absent from dependency graph"))?;
    if is_env(root, selected)? {
        return Ok(Decision::default());
    }
    let model = read_model(root, &selected.identity, objects)?;
    Ok(Decision {
        pin: latest(&model)?
            .map(|version| Pin { package_name: target.package_name.trim().to_owned(), version }),
        loaded: true,
    })
}

/// Return `true` when `selected`'s local `Version` object marks the [`Selected`] component as a Bit environment (`teambit.envs/envs`).
fn is_env(root: &Path, selected: &Selected) -> io::Result<bool> {
    let version = outbound::read_object(
        &crate::scope_path(root).join("objects"),
        selected.version.as_deref().ok_or_else(|| invalid("lane component version"))?,
        "Version",
    )?;
    Ok(version["extensions"]
        .as_array()
        .is_some_and(|extensions| {
            extensions
                .iter()
                .any(|extension| {
                    crate::workspace::engine::client_status::config::is_extension_aspect(
                        extension,
                        "teambit.envs/envs",
                    ) && (extension["data"]["type"] == "env"
                        || extension["config"]["type"] == "env")
                })
        }))
}

fn validate_graph(bitmap: &Value, components: &[DependencyComponent]) -> io::Result<()> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("dependency bitmap"))?;
    let expected = rows
        .iter()
        .filter(|(key, row)| {
            !key.starts_with('$')
                && *key != "_bit_lane"
                && *key != "version"
                && row.is_object()
                && row["isAvailableOnCurrentLane"] != false
                && !crate::workspace::engine::client_status::config::is_config_removed(
                    &row["config"],
                )
        })
        .map(|(key, row)| bitmap_row_identity(key, row))
        .collect::<io::Result<HashSet<_>>>()?;
    let actual = components
        .iter()
        .map(|component| component.identity.clone())
        .collect::<HashSet<_>>();
    if expected != actual || actual.len() != components.len() {
        return Err(invalid("dependency graph does not cover the current workspace"));
    }
    if components
        .iter()
        .any(|component| {
            component.dependencies
                .iter()
                .any(|dependency| !actual.contains(dependency))
        })
    {
        return Err(invalid("lane deletion has dependencies outside the captured workspace"));
    }
    Ok(())
}

#[inline]
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn bitmap_row_identity(key: &str, row: &Value) -> io::Result<String> {
    let key = key.trim();
    let (key_id, key_ver) = key
        .rsplit_once('@')
        .map_or((key, None), |(id, ver)| (id.trim(), Some(ver.trim())));
    let key_scope = key_id
        .split_once('/')
        .map(|(scope_part, _)| scope_part.trim())
        .filter(|scope| !scope.is_empty());
    let scope = non_empty_str(&row["scope"])
        .or_else(|| non_empty_str(&row["defaultScope"]))
        .or(key_scope)
        .ok_or_else(|| invalid("dependency component scope"))?;
    let name = non_empty_str(&row["name"])
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(scope)
                .and_then(|rest| rest.strip_prefix('/'))
                .unwrap_or(key_id)
                .trim()
        });
    let version = non_empty_str(&row["version"])
        .or_else(|| key_ver.filter(|ver| !ver.is_empty()))
        .unwrap_or_default();
    Ok(if version.is_empty() {
        format!("{scope}/{name}")
    } else {
        format!("{scope}/{name}@{version}")
    })
}

fn matches_index_row(row: &Value, scope: &str, name: &str) -> bool {
    let scope = scope.trim();
    let name = name.trim();
    let (row_scope, row_name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default().trim(), nm.trim()));
    row["isSymlink"] != true && row_name == name && (row_scope.is_empty() || row_scope == scope)
}

fn read_model(root: &Path, identity: &str, objects: &mut Vec<FrozenObject>) -> io::Result<Value> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("component identity"))?;
    let index: Value = crate::parse_jsonc(&fs::read(crate::scope_path(root).join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("scope components"))?;
    let matches = rows
        .iter()
        .filter(|row| matches_index_row(row, scope, name))
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        return Err(invalid("component is not uniquely indexed"));
    }
    let hash = matches[0]["hash"].as_str().ok_or_else(|| invalid("Component hash"))?;
    crate::merge_history::hash(hash)?;
    objects.push(freeze(root, hash)?);
    let model = outbound::read_object(&crate::scope_path(root).join("objects"), hash, "Component")?;
    let model_scope = model["scope"].as_str().unwrap_or_default();
    if (!model_scope.is_empty() && model_scope != scope) || model["name"] != name {
        return Err(invalid("Component identity"));
    }
    Ok(model)
}

fn latest(model: &Value) -> io::Result<Option<String>> {
    let versions = model["versions"].as_object().ok_or_else(|| invalid("Component tags"))?;
    let mut best: Option<(Version, &str)> = None;
    for tag in versions.keys() {
        let trimmed = tag.trim();
        let version = Version::parse(trimmed).map_err(io::Error::other)?;
        if best
            .as_ref()
            .is_none_or(|(current, _)| version >= *current)
        {
            best = Some((version, trimmed));
        }
    }
    Ok(best.map(|(_, tag)| tag.to_owned()))
}
