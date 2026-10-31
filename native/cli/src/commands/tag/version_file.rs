//! `VersionFileParser`: exact component lines, comments and the last DEFAULT.

#[cfg(test)]
mod tests;

use crate::commands::status::js::decline;
use bit_install::policy::scope::read_proof;
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) struct Captured {
    pub(super) data: Value,
    pub(super) proof: Value,
}

pub(super) fn read(root: &Path, entered: &str) -> io::Result<Captured> {
    let path = root.join(entered);
    let metadata = fs::metadata(&path)?;
    if !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err(decline("versions file ordinary byte budget"));
    }
    let proof = read_proof(&path)?;
    let content = fs::read_to_string(&path)?;
    let mut data = parse(&content)?;
    let versions = entered_versions(&data);
    data["semver"] =
        crate::commands::status::grammar::snapshot(versions.iter().map(String::as_str))
            .ok_or_else(|| decline("versions file semantic grammar limits"))?;
    if proof != read_proof(&path)? {
        return Err(decline("versions file changed while reading"));
    }
    Ok(Captured { data, proof })
}

fn parse(content: &str) -> io::Result<Value> {
    let mut entries = Vec::new();
    let mut default = None;
    for line in content
        .trim_start_matches('\u{feff}')
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
    {
        if let Some(version) = line.strip_prefix("DEFAULT:") {
            let version = version.trim();
            if version.is_empty() {
                return Err(decline("DEFAULT version cannot be empty"));
            }
            default = Some(version);
            continue;
        }
        let (identity, version) =
            line.split_once(':').ok_or_else(|| decline("versions file line format"))?;
        let (identity, version) = (identity.trim(), version.trim());
        if identity.is_empty() || version.is_empty() {
            return Err(decline("versions file line format"));
        }
        entries.push(json!({"identity":identity,"version":version}));
    }
    Ok(json!({"entries":entries,"default":default}))
}

pub(super) fn entered_versions(data: &Value) -> Vec<String> {
    data["entries"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry["version"].as_str())
        .chain(data["default"].as_str())
        .map(str::to_owned)
        .collect()
}
