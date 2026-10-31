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
            let scope = model["scope"].as_str().unwrap_or_default();
            let name = model["name"].as_str().unwrap_or_default();
            (if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") }, model)
        })
        .collect();
    let mut seen = HashSet::new();
    let mut references = Vec::new();
    for target in targets {
        if target.version.is_empty() {
            continue;
        }
        let Some(model) = index
            .get(&target.identity)
            .or_else(|| {
                target.identity
                    .split_once('/')
                    .and_then(|(_, name)| index.get(name))
            })
        else {
            continue;
        };
        let reference = reference(model, &target.version)?;
        if seen.insert(reference.clone()) {
            references.push(reference);
        }
    }
    Ok(references)
}
pub(in crate::workspace::engine) fn reference(model: &Value, version: &str) -> io::Result<String> {
    if version.is_empty() || version == "latest" {
        return model["head"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| invalid("status model version absent"));
    }
    if crate::merge_history::hash(version).is_ok() {
        return Ok(version.to_owned());
    }
    model["orphanedVersions"]
        .get(version)
        .unwrap_or_else(|| &model["versions"][version])
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("status model version absent"))
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
            let head = head.as_str().ok_or_else(|| invalid("status model head"))?;
            crate::merge_history::hash(head)?;
            if seen.insert(head.to_owned()) {
                references.push(head.to_owned());
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
        crate::merge_history::hash(head)?;
        if seen.insert(head.clone()) {
            references.push(head.clone());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
