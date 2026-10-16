//! `RemoveMain.getDeletedDepsToPinToMain` for a captured workspace-only graph.

use super::{FrozenObject, component_remove::Selected, freeze, invalid, outbound};
use node_semver::Version;
use serde_json::Value;
use std::{collections::HashSet, fs, io, path::Path};

pub struct DependencyComponent {
    pub identity: String,
    pub package_name: String,
    pub dependencies: Vec<String>,
}

#[derive(Default)]
pub(super) struct Decision {
    pub(super) pin: Option<Pin>,
    pub(super) loaded: bool,
}

pub struct Pin {
    pub package_name: String,
    pub version: String,
}

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
        selected.identity,
        selected.version.as_deref().ok_or_else(|| invalid("lane component version"))?,
    );
    validate_graph(bitmap, components)?;
    if !components
        .iter()
        .any(|component| {
            component.identity != identity && component.dependencies.contains(&identity)
        })
    {
        return Ok(Decision::default());
    }
    let target = components
        .iter()
        .find(|component| component.identity == identity)
        .ok_or_else(|| invalid("deleted component is absent from dependency graph"))?;
    if is_env(root, selected)? {
        return Ok(Decision::default());
    }
    let model = read_model(root, &selected.identity, objects)?;
    Ok(Decision {
        pin: latest(&model)?
            .map(|version| Pin { package_name: target.package_name.clone(), version }),
        loaded: true,
    })
}

fn is_env(root: &Path, selected: &Selected) -> io::Result<bool> {
    let version = outbound::read_object(
        &root.join(".bit/objects"),
        selected.version.as_deref().ok_or_else(|| invalid("lane component version"))?,
        "Version",
    )?;
    Ok(version["extensions"]
        .as_array()
        .is_some_and(|extensions| {
            extensions
                .iter()
                .any(|extension| {
                    extension["name"] == "teambit.envs/envs" && extension["data"]["type"] == "env"
                })
        }))
}

fn validate_graph(bitmap: &Value, components: &[DependencyComponent]) -> io::Result<()> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("dependency bitmap"))?;
    let expected = rows
        .iter()
        .filter(|(key, _)| !key.starts_with('$') && *key != "_bit_lane")
        .map(|(_, row)| {
            let scope = row["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
                .or_else(|| row["defaultScope"].as_str())
                .ok_or_else(|| invalid("dependency component scope"))?;
            let name = row["name"].as_str().ok_or_else(|| invalid("dependency component name"))?;
            let version =
                row["version"].as_str().ok_or_else(|| invalid("dependency component version"))?;
            Ok(if version.is_empty() {
                format!("{scope}/{name}")
            } else {
                format!("{scope}/{name}@{version}")
            })
        })
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

fn read_model(root: &Path, identity: &str, objects: &mut Vec<FrozenObject>) -> io::Result<Value> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("component identity"))?;
    let index: Value = serde_json::from_slice(&fs::read(root.join(".bit/index.json"))?)?;
    let rows = index["components"].as_array().ok_or_else(|| invalid("scope components"))?;
    let matches = rows
        .iter()
        .filter(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        .collect::<Vec<_>>();
    if matches.len() != 1 || matches[0]["isSymlink"] != false {
        return Err(invalid("component is not uniquely indexed"));
    }
    let hash = matches[0]["hash"].as_str().ok_or_else(|| invalid("Component hash"))?;
    crate::merge_history::hash(hash)?;
    objects.push(freeze(root, hash)?);
    let model = outbound::read_object(&root.join(".bit/objects"), hash, "Component")?;
    if model["scope"] != scope || model["name"] != name {
        return Err(invalid("Component identity"));
    }
    Ok(model)
}

fn latest(model: &Value) -> io::Result<Option<String>> {
    let versions = model["versions"].as_object().ok_or_else(|| invalid("Component tags"))?;
    versions
        .keys()
        .map(|tag| {
            Version::parse(tag)
                .map(|version| (version, tag.clone()))
                .map_err(io::Error::other)
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|versions| {
            versions
                .into_iter()
                .max_by(|(left, _), (right, _)| left.cmp(right))
                .map(|(_, tag)| tag)
        })
}

#[cfg(test)]
mod tests;
