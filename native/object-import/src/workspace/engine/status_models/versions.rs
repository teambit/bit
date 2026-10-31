#[cfg(test)]
mod tests;

use super::{Reader, Target, invalid};
use rayon::prelude::*;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io,
};

pub(super) fn references(models: &[Value], targets: &[Target]) -> io::Result<Vec<String>> {
    let index: HashMap<_, _> = models
        .iter()
        .map(|model| {
            let scope = model["scope"].as_str().map_or("", str::trim);
            let name = model["name"].as_str().map_or("", str::trim);
            (if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") }, model)
        })
        .collect();
    let mut seen = HashSet::new();
    let mut references = Vec::new();
    for target in targets {
        let version = target.version.trim();
        let identity = target.identity.trim();
        if version.is_empty() || identity.is_empty() {
            continue;
        }
        let Some(model) = index
            .get(identity)
            .or_else(|| {
                identity
                    .split_once('/')
                    .and_then(|(_, name)| index.get(name.trim()))
            })
        else {
            continue;
        };
        let reference = reference(model, version)?;
        if seen.insert(reference.clone()) {
            references.push(reference);
        }
    }
    Ok(references)
}
pub(in crate::workspace::engine) fn reference(model: &Value, version: &str) -> io::Result<String> {
    let version = version.trim();
    if matches!(version, "" | "latest" | "head") {
        let head = model["head"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("status model version absent"))?;
        return Ok(crate::validate::hexadecimal(&crate::merge_history::hash(head)?));
    }
    if let Ok(digest) = crate::merge_history::hash(version) {
        return Ok(crate::validate::hexadecimal(&digest));
    }
    let resolved = model["orphanedVersions"]
        .get(version)
        .unwrap_or_else(|| &model["versions"][version])
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("status model version absent"))?;
    Ok(crate::validate::hexadecimal(&crate::merge_history::hash(resolved)?))
}

// The mutable Version body is read once per reference in this command.
pub(super) fn read(
    reader: &Reader<'_>,
    references: &[String],
    required: &[String],
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<(String, Value)>> {
    pool.install(|| {
        references
            .par_iter()
            .map(|reference| read_single(reader, reference, required))
            .collect::<io::Result<Vec<_>>>()
            .map(|values| values.into_iter().flatten().collect())
    })
}

fn read_single(
    reader: &Reader<'_>,
    reference: &String,
    required: &[String],
) -> io::Result<Option<(String, Value)>> {
    let value = match reader.read(reference, "Version") {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound && !required.contains(reference) => {
            return Ok(None);
        }
        Err(error) => return Err(error),
    };
    crate::history_query::validate_version(&value)?;
    crate::read_version::parents(&value)?;
    if matches!(value["schema"].as_str(), Some("1.0.0" | "2.0.0")) {
        super::harmony::validate(&value)?;
    }
    if required.contains(reference) {
        verify_required_sources(reader, &value)?;
    }
    Ok(Some((reference.clone(), value)))
}

fn verify_required_sources(reader: &Reader<'_>, value: &Value) -> io::Result<()> {
    let Some(files) = value["files"].as_array() else { return Ok(()) };
    for file in files {
        if let Some(source) = file["file"].as_str() {
            reader.verify_source(source)?;
        }
    }
    Ok(())
}

pub(super) fn include_heads(models: &[Value], references: &mut Vec<String>) -> io::Result<()> {
    let mut seen: HashSet<_> = references.iter().cloned().collect();
    for model in models {
        if let Some(head) = model
            .get("head")
            .filter(|head| !head.is_null())
        {
            let raw = head.as_str().ok_or_else(|| invalid("status model head"))?;
            let canonical = crate::validate::hexadecimal(&crate::merge_history::hash(raw)?);
            if seen.insert(canonical.clone()) {
                references.push(canonical);
            }
        }
    }
    Ok(())
}

pub(super) fn include_lane_heads(
    heads: &std::collections::HashMap<String, String>,
    references: &mut Vec<String>,
) -> io::Result<()> {
    let mut seen: HashSet<_> = references.iter().cloned().collect();
    for head in heads.values() {
        let canonical = crate::validate::hexadecimal(&crate::merge_history::hash(head)?);
        if seen.insert(canonical.clone()) {
            references.push(canonical);
        }
    }
    Ok(())
}
