use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Serialize {
    pub(super) objects: Vec<Object>,
    pub(super) staging_directory: PathBuf,
    #[serde(default)]
    pub(super) pretty: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Object {
    #[serde(rename = "type")]
    pub(super) kind: String,
    pub(super) hash: Option<String>,
    pub(super) fields: Option<crate::js_json::Value>,
    pub(super) source: Option<Workspace>,
    pub(super) repository: Option<Repository>,
    pub(super) body: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Workspace {
    pub(super) path: PathBuf,
    pub(super) hash: String,
    pub(super) source_hash: String,
    #[serde(default)]
    pub(super) normalization: Normalization,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Repository {
    pub(super) objects_directory: PathBuf,
    pub(super) hash: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Commit {
    pub(super) token: String,
    pub(super) objects_directory: PathBuf,
    pub(super) owner: Option<Owner>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Owner {
    pub(super) uid: u32,
    pub(super) gid: u32,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Normalization {
    #[default]
    Workspace,
    LinuxEol,
}
