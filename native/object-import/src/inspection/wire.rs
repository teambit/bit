//! Wire request payloads ([`Begin`], [`Input`], [`Token`]) for workspace file inspection and model comparison operations.

use serde::Deserialize;
use std::path::PathBuf;
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Begin {
    pub(super) files: Vec<Input>,
    pub(super) workspace_root: bool,
    #[serde(default)]
    pub(super) memory_only: bool,
    #[serde(default)]
    pub(super) owned_memory: bool,
    #[serde(default)]
    pub(super) snapshot_directory: PathBuf,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Input {
    pub(super) relative_path: String,
    pub(super) path: PathBuf,
    pub(super) raw_hash: Option<String>,
    pub(super) read_token: Option<u64>,
    pub(super) snapshot_hash: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Token {
    pub(super) token: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Files {
    pub(super) token: String,
    pub(super) model_files: Vec<Model>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Model {
    pub(super) relative_path: String,
    pub(super) hash: String,
    #[serde(rename = "name")]
    pub(super) _name: Option<Box<str>>,
    #[serde(rename = "test")]
    pub(super) _test: Option<bool>,
}
impl Model {
    #[inline]
    pub(super) fn normalized_hash(&self) -> &str {
        self.hash.trim()
    }
}
