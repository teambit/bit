use serde::{Deserialize, Serialize};
use std::path::PathBuf;
#[derive(Deserialize)]
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
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Version {
    pub(super) hash: String,
    pub(super) files: Vec<Manifest>,
    #[serde(rename = "proofFiles")]
    pub(super) proof_files: Option<Vec<Manifest>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Manifest {
    pub(super) hash: String,
    pub(super) relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) test: Option<bool>,
}
#[derive(Deserialize)]
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
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Labels {
    pub(super) current: String,
    pub(super) other: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Apply {
    pub(super) token: String,
    pub(super) strategy: Option<String>,
    pub(super) force_ours: bool,
    pub(super) current_exists: bool,
    pub(super) tracked: bool,
    pub(super) workspace_root: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Materialize {
    pub(super) token: String,
    pub(super) files: Vec<Destination>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Destination {
    pub(super) plan_index: usize,
    pub(super) path: PathBuf,
    pub(super) overwrite: bool,
    pub(super) eol: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Token {
    #[serde(deserialize_with = "deserialize_token")]
    pub(super) token: String,
}

fn deserialize_token<'de, Deser>(deserializer: Deser) -> Result<String, Deser::Error>
where
    Deser: serde::Deserializer<'de>,
{
    let token = String::deserialize(deserializer)?;
    Ok(token.trim_end_matches('\0').to_owned())
}
