use serde::Deserialize;
use std::path::PathBuf;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Begin {
    pub(super) files: Vec<Input>,
    pub(super) workspace_root: bool,
    #[serde(default)]
    pub(super) memory_only: bool,
    pub(super) snapshot_directory: PathBuf,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Input {
    pub(super) relative_path: String,
    pub(super) path: PathBuf,
    pub(super) raw_hash: Option<String>,
    pub(super) read_token: Option<u64>,
    pub(super) snapshot_hash: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Token {
    pub(super) token: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Files {
    pub(super) token: String,
    pub(super) model_files: Vec<Model>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Model {
    pub(super) relative_path: String,
    pub(super) hash: String,
    #[serde(rename = "name")]
    pub(super) _name: Option<String>,
    #[serde(rename = "test")]
    pub(super) _test: Option<bool>,
}
