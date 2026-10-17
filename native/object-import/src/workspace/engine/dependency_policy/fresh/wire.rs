use crate::workspace::engine::dependency_graph::proof::Proof;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;

pub(super) type Packages = [Map<String, Value>; 3];
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Detect {
    pub(super) root: PathBuf,
    pub(super) component_root: PathBuf,
    pub(super) identity: String,
    pub(super) files: Vec<PathBuf>,
    pub(super) detection: Detection,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Detection {
    pub(super) graph: Value,
    pub(super) dev_files: Vec<String>,
    pub(super) model_packages: Packages,
    pub(super) workspace_policy: Packages,
    pub(super) core_packages: Vec<String>,
    #[serde(default)]
    pub(super) core_aspect_ids: Vec<String>,
    pub(super) workspace_components: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    pub(super) root: PathBuf,
    pub(super) component_root: PathBuf,
    pub(super) capture: Capture,
    pub(super) policies: Value,
    pub(super) finish: Value,
    pub(super) resolution: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Capture {
    pub(super) identity: String,
    pub(super) detected: Value,
    pub(super) component_versions: Vec<ComponentVersion>,
    pub(super) read_set: Vec<Proof>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ComponentVersion {
    pub(super) field: usize,
    pub(super) index: usize,
    pub(super) concrete: Option<String>,
    pub(super) dependent: Option<String>,
}
