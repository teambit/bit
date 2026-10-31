//! Published `loadAllVersions` uses tagged/orphaned Versions and flattened dependency edges.
use super::{diagnostics, invalid, proofs};
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn validate(
    root: &Path,
    identity: &str,
    removed: &[String],
    reads: &mut proofs::ReadSet,
) -> io::Result<()> {
    let bytes = proofs::read(&crate::scope_path(root).join("index.json"), reads)?
        .ok_or_else(|| invalid("lane dependent index absent"))?;
    let index: Value = serde_json::from_slice(&bytes)?;
    let objects = crate::scope_path(root).join("objects");
    let references = references(&objects, &index, reads)?;
    let model = proofs::object(&objects, &super::object_hash(identity), "Component", reads)?;
    for hash in removed.iter().rev() {
        let label = tag(&model, hash);
        let dependents = immediate(&objects, &references, identity, &label, reads)?;
        if !dependents.is_empty() {
            return Err(diagnostics::error(format!(
                "unable to reset {identity}, the version {label} has the following dependent(s) {}",
                dependents.join(", "),
            )));
        }
    }
    Ok(())
}

fn immediate(
    objects: &Path,
    references: &[(String, String)],
    identity: &str,
    label: &str,
    reads: &mut proofs::ReadSet,
) -> io::Result<Vec<String>> {
    let target = format!("{identity}@{label}");
    let mut found = Vec::new();
    for (reference, id) in references {
        let version = match proofs::object(objects, reference, "Version", reads) {
            Ok(version) => version,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        if version["flattenedDependencies"]
            .as_array()
            .is_some_and(|rows| {
                rows.iter()
                    .any(|row| dependency_id(row).as_deref() == Some(target.as_str()))
            })
            && !found.contains(id)
        {
            found.push(id.clone());
        }
    }
    Ok(found)
}

fn references(
    objects: &Path,
    index: &Value,
    reads: &mut proofs::ReadSet,
) -> io::Result<Vec<(String, String)>> {
    let mut refs = Vec::new();
    for row in index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("lane dependent components"))?
    {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("lane dependent model hash"))?;
        let model = proofs::object(objects, hash, "Component", reads)?;
        let identity = format!(
            "{}/{}",
            model["scope"].as_str().ok_or_else(|| invalid("lane dependent scope"))?,
            model["name"].as_str().ok_or_else(|| invalid("lane dependent name"))?,
        );
        let mut versions = model["versions"]
            .as_object()
            .ok_or_else(|| invalid("lane dependent versions"))?
            .clone();
        if let Some(orphaned) = model["orphanedVersions"].as_object() {
            versions.extend(orphaned.clone());
        }
        for (label, hash) in versions {
            if refs.len() >= 32768 {
                return Err(invalid("lane dependent reference limit"));
            }
            let hash = hash.as_str().ok_or_else(|| invalid("lane dependent version reference"))?;
            crate::merge_history::hash(hash)?;
            refs.push((hash.to_owned(), format!("{identity}@{label}")));
        }
    }
    Ok(refs)
}

fn tag(model: &Value, hash: &str) -> String {
    model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .find_map(|(tag, value)| (value.as_str() == Some(hash)).then(|| tag.clone()))
        })
        .unwrap_or_else(|| hash.to_owned())
}

fn dependency_id(value: &Value) -> Option<String> {
    if let Some(id) = value
        .as_str()
        .filter(|id| !id.is_empty())
    {
        return Some(id.to_owned());
    }
    let scope = value["scope"]
        .as_str()
        .filter(|val| !val.is_empty())?;
    let name = value["name"]
        .as_str()
        .filter(|val| !val.is_empty())?;
    let version = value["version"]
        .as_str()
        .filter(|val| !val.is_empty())?;
    Some(format!("{scope}/{name}@{version}"))
}
