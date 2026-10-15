//! Reset's existing component.json writer. Bitmap overrides are cleared separately.
use super::{Record, invalid, planning, proof};
use serde_json::{Map, Value, json};
use std::{collections::HashSet, io, path::PathBuf};

pub(super) struct Prepared {
    proofs: Vec<proof::Proof>,
    writes: Vec<(PathBuf, Vec<u8>)>,
}

pub(super) fn validate_target(target: &Value) -> io::Result<()> {
    if let Some(bitmap) = target.get("bitmapConfig") {
        let rows = bitmap.as_object().ok_or_else(|| invalid("reset bitmap configuration"))?;
        for (name, value) in rows {
            configurations::plain(name, value)?;
        }
    }
    let config = &target["config"];
    if config.is_null() {
        return Ok(());
    }
    let fields = config.as_object().ok_or_else(|| invalid("reset component configuration"))?;
    if fields
        .keys()
        .any(|key| !matches!(key.as_str(), "componentId" | "extensions" | "propagate" | "$schema"))
        || config
            .get("propagate")
            .is_some_and(|value| !value.is_boolean())
        || !config["extensions"].is_object()
    {
        return Err(invalid("reset unsupported component configuration"));
    }
    Ok(())
}

pub(super) fn prepare(record: &Record, plan: &planning::Planned) -> io::Result<Prepared> {
    let mut prepared = Prepared { proofs: Vec::new(), writes: Vec::new() };
    for material in &plan.materials {
        let full =
            material.output["id"].as_str().ok_or_else(|| invalid("reset written identity"))?;
        let identity = full.rsplit_once('@').map_or(full, |(identity, _)| identity);
        let target = record.targets
            .iter()
            .find(|target| target["identity"] == identity)
            .ok_or_else(|| invalid("reset configuration target"))?;
        validate_target(target)?;
        let directory =
            target["directory"].as_str().ok_or_else(|| invalid("reset config directory"))?;
        let path = record.request.root.join(directory).join("component.json");
        let bytes = proof::read(&path, &mut prepared.proofs)?;
        let Some(bytes) = bytes else {
            if !target["config"].is_null() {
                return Err(invalid("reset config disappeared"));
            }
            continue;
        };
        let original: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
        if original != target["config"] {
            return Err(invalid("reset configuration changed"));
        }
        paths::capture(&record.request.root, &path, &mut prepared.proofs)?;
        validate_destination(&path)?;
        let output = document(identity, &material.version_name, &material.version, &original)?;
        let mut bytes = serde_json::to_vec_pretty(&output).map_err(io::Error::other)?;
        bytes.push(b'\n');
        prepared.writes.push((path, bytes));
    }
    prepared.validate()?;
    Ok(prepared)
}

fn document(identity: &str, version: &str, stored: &Value, original: &Value) -> io::Result<Value> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("reset config identity"))?;
    let mut extensions = Map::new();
    for row in ordered_extensions(stored, original)? {
        let name = row["name"].as_str().ok_or_else(|| invalid("reset custom extension"))?;
        if row.get("extensionId").is_some() || row.get("legacyId").is_some() {
            return Err(invalid("reset custom extension identity"));
        }
        let config = configurations::plain(name, &row["config"])?;
        extensions.entry(name).or_insert(config);
    }
    Ok(
        json!({"componentId":{"scope":scope,"name":name,"version":version},"propagate":false,"extensions":extensions}),
    )
}

fn ordered_extensions<'a>(stored: &'a Value, original: &Value) -> io::Result<Vec<&'a Value>> {
    let rows = stored["extensions"].as_array().ok_or_else(|| invalid("reset model extensions"))?;
    let mut seen = HashSet::new();
    let unique: Vec<_> = rows
        .iter()
        .filter(|row| seen.insert(row["name"].clone()))
        .collect();
    let specific = unique
        .iter()
        .copied()
        .filter(|row| row["config"]["__specific"] == true);
    let inherited = unique
        .iter()
        .copied()
        .filter(|row| original["propagate"] == true && row["config"]["__specific"] != true);
    Ok(specific.chain(inherited).collect())
}

fn validate_destination(path: &std::path::Path) -> io::Result<()> {
    crate::store::Store::validate_metadata_write(path)?;
    #[cfg(target_os = "linux")]
    attributes::validate(path)?;
    Ok(())
}
impl Prepared {
    pub(super) fn validate(&self) -> io::Result<()> {
        proof::verify(&self.proofs)?;
        for (path, _) in &self.writes {
            validate_destination(path)?;
        }
        Ok(())
    }
    pub(super) fn commit(&self) -> io::Result<()> {
        for (path, bytes) in &self.writes {
            crate::store::Store::write_metadata(path, bytes)?;
        }
        Ok(())
    }
}
#[cfg(target_os = "linux")]
mod attributes;
mod configurations;
mod paths;
#[cfg(test)]
mod tests;
