//! JSON wire schemas for checkout transition requests ([`Prepare`], `Apply`, `Materialize`, and `Token`).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
/// Wire payload for the `checkoutPrepare` transition request containing [`Version`], [`Current`], and [`Labels`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Prepare {
    #[serde(default)]
    pub(super) packed_bodies: bool,
    pub(super) objects_directory: PathBuf,
    pub(super) snapshot_directory: PathBuf,
    pub(super) target: Version,
    pub(super) current: Vec<Current>,
    pub(super) base: Option<Version>,
    pub(super) labels: Option<Labels>,
}
/// Target or base `Version` manifest wire payload with optional `proofFiles`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Version {
    pub(super) hash: String,
    pub(super) files: Vec<Manifest>,
    #[serde(rename = "proofFiles")]
    pub(super) proof_files: Option<Vec<Manifest>>,
}
/// Manifest file entry pairing a `Source` SHA-1 hash with its workspace-relative path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Manifest {
    pub(super) hash: String,
    pub(super) relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) test: Option<bool>,
}
/// Tracked current workspace file entry and its expected raw and snapshot SHA-1 hashes.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Current {
    pub(super) read_token: Option<u64>,
    pub(super) relative_path: String,
    pub(super) path: PathBuf,
    pub(super) raw_hash: String,
    pub(super) snapshot_hash: String,
    pub(super) protected: bool,
    pub(super) source_hash: Option<String>,
    #[serde(default)]
    pub(super) bitmap: bool,
}
/// Conflict marker label strings (`<<<<<<< current` and `>>>>>>> other`) for three-way merges.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Labels {
    pub(super) current: String,
    pub(super) other: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Apply {
    #[serde(deserialize_with = "deserialize_token")]
    pub(super) token: String,
    pub(super) strategy: Option<String>,
    pub(super) force_ours: bool,
    pub(super) current_exists: bool,
    pub(super) tracked: bool,
    pub(super) workspace_root: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Materialize {
    #[serde(deserialize_with = "deserialize_token")]
    pub(super) token: String,
    pub(super) files: Vec<Destination>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Destination {
    pub(super) plan_index: usize,
    pub(super) path: PathBuf,
    pub(super) overwrite: bool,
    pub(super) eol: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Token {
    #[serde(deserialize_with = "deserialize_token")]
    pub(super) token: String,
}

/// Return `true` when `ch` is whitespace or NUL (`\0`) to trim from wire tokens in [`deserialize_token`].
#[inline]
const fn is_token_trim_char(ch: char) -> bool {
    ch.is_whitespace() || ch == '\0'
}

#[inline]
fn deserialize_token<'de, Deser>(deserializer: Deser) -> Result<String, Deser::Error>
where
    Deser: serde::Deserializer<'de>,
{
    let token = String::deserialize(deserializer)?;
    let trimmed = token.trim_matches(is_token_trim_char);
    if trimmed.len() == token.len() { Ok(token) } else { Ok(trimmed.to_owned()) }
}
