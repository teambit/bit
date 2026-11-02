//! `VersionFileParser`: exact component lines, comments and the last DEFAULT.
//!
//! [`read`] parses `--ver-file` inputs and scope proofs ([`read_proof`]) into [`Captured`] JSON [`Value`] maps.

#[cfg(test)]
mod tests;

use crate::commands::status::js::decline;
use bit_install::policy::scope::read_proof;
use serde_json::{Value, json};
use std::{fs, io, path::Path};

/// Parsed `--versions-file` payload paired with its filesystem [`read_proof`] receipt.
pub(super) struct Captured {
    /// Parsed JSON [`Value`] containing `entries`, `default`, and `semver` grammar snapshot.
    pub(super) data: Value,
    /// Filesystem [`read_proof`] receipt captured when reading the `--versions-file`.
    pub(super) proof: Value,
}

/// Reads and validates the `--versions-file` at `entered` relative to `root` into a [`Captured`] receipt.
pub(super) fn read(root: &Path, entered: &str) -> io::Result<Captured> {
    let entered = entered.trim();
    if entered.is_empty() {
        return Err(decline("versions file path cannot be empty"));
    }
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

/// Parses `<identity>: <version>` and `DEFAULT: <version>` lines from `--versions-file` `content`.
fn parse(content: &str) -> io::Result<Value> {
    let mut entries = Vec::new();
    let mut default = None;
    for line in content
        .trim_start_matches('\u{feff}')
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
    {
        let (identity, version) =
            line.split_once(':').ok_or_else(|| decline("versions file line format"))?;
        let (identity, version) = (identity.trim(), version.trim());
        if version.is_empty() || version.chars().any(char::is_whitespace) {
            return Err(decline("versions file line format"));
        }
        if identity == "DEFAULT" {
            default = Some(version);
            continue;
        }
        if identity.chars().any(char::is_whitespace) || identity.split('/').any(str::is_empty) {
            return Err(decline("versions file line format"));
        }
        entries.push(json!({"identity":identity,"version":version}));
    }
    Ok(json!({"entries":entries,"default":default}))
}

/// Collects all non-empty version strings from `data["entries"]` and `data["default"]`.
#[inline]
pub(super) fn entered_versions(data: &Value) -> Vec<String> {
    data["entries"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry["version"].as_str())
        .chain(data["default"].as_str())
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map(str::to_owned)
        .collect()
}
