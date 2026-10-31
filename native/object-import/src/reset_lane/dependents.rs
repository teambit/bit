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
    let index: Value = crate::parse_jsonc(&bytes)?;
    let objects = crate::scope_path(root).join("objects");
    let references = references(&objects, &index, reads)?;
    let (scope, name) = identity
        .split_once('/')
        .unwrap_or(("", identity));
    let model_hash = super::indexed_hash(&index, "components", scope, name)
        .unwrap_or_else(|_| super::object_hash(identity));
    let model = proofs::object(&objects, &model_hash, "Component", reads)?;
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
        let has_dep = ["flattenedDependencies", "flattenedDevDependencies"]
            .into_iter()
            .filter_map(|field| version[field].as_array())
            .flatten()
            .any(|row| dependency_id(row).as_deref() == Some(target.as_str()));
        if has_dep && !found.contains(id) {
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
        if row["isSymlink"] == true {
            continue;
        }
        let hash = row["hash"].as_str().ok_or_else(|| invalid("lane dependent model hash"))?;
        let model = proofs::object(objects, hash, "Component", reads)?;
        let identity = dependent_identity(&model, row)?;
        let mut versions = model["versions"]
            .as_object()
            .cloned()
            .unwrap_or_default();
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

fn dependent_identity(model: &Value, row: &Value) -> io::Result<String> {
    let (row_scope, row_name) = super::row_id_parts(&row["id"]);
    let scope = non_empty_str(&model["scope"])
        .or_else(|| (!row_scope.trim().is_empty()).then(|| row_scope.trim()))
        .ok_or_else(|| invalid("lane dependent scope"))?;
    let name = non_empty_str(&model["name"])
        .or_else(|| (!row_name.trim().is_empty()).then(|| row_name.trim()))
        .ok_or_else(|| invalid("lane dependent name"))?;
    Ok(format!("{scope}/{name}"))
}

fn tag(model: &Value, hash: &str) -> String {
    model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(|versions| versions.iter())
        .find_map(|(tag, value)| (value.as_str() == Some(hash)).then(|| tag.clone()))
        .unwrap_or_else(|| hash.to_owned())
}

fn dependency_id(value: &Value) -> Option<String> {
    if let Some(id) = non_empty_str(value) {
        return Some(id.to_owned());
    }
    let id_obj = value
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(value);
    let scope = non_empty_str(&id_obj["scope"]).or_else(|| non_empty_str(&value["scope"]))?;
    let raw_name = non_empty_str(&id_obj["name"]).or_else(|| non_empty_str(&value["name"]))?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| {
            (bare.trim(), Some(ver.trim()).filter(|ver| !ver.is_empty()))
        });
    if name.is_empty() {
        return None;
    }
    let version = non_empty_str(&value["version"])
        .or_else(|| non_empty_str(&id_obj["version"]))
        .or_else(|| non_empty_str(&value["head"]))
        .or(inline_ver)?;
    Some(format!("{scope}/{name}@{version}"))
}

fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
