use super::super::wire::Entry;
use serde::Deserialize;
use std::collections::HashMap;

type Versions = HashMap<String, String>;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    pub(super) entries: Vec<Entry>,
    pub(super) components: [Vec<usize>; 3],
    pub(super) extensions: Vec<String>,
    pub(super) sources: Sources,
    pub(super) policy: Policy,
    pub(super) grammar: HashMap<String, Grammar>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Sources {
    pub(super) bitmap: Vec<String>,
    pub(super) lane: Vec<String>,
    pub(super) model: Vec<String>,
    pub(super) component_config: Versions,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Policy {
    pub(super) manual: [Versions; 3],
    pub(super) env_own: Vec<String>,
    pub(super) workspace: Versions,
    pub(super) automatic: [Versions; 3],
    pub(super) merge: [Versions; 3],
    pub(super) prefix: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Grammar {
    pub(super) valid: bool,
    pub(super) range: bool,
    pub(super) coerced: Option<String>,
}
pub(super) fn unversioned(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed.rsplit_once('@').map_or(trimmed, |(identity, _)| identity.trim())
}
pub(super) fn version(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed.rsplit_once('@').map_or("latest", |(_, version)| version.trim())
}
pub(super) fn identity(base: &str, version: &str) -> String {
    let version = version.trim();
    if matches!(version, "" | "latest" | "head") {
        unversioned(base).to_owned()
    } else {
        format!("{}@{version}", unversioned(base))
    }
}
pub(super) fn snap(value: &str) -> bool {
    let value = value.trim();
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
impl Policy {
    pub(super) fn ranges(&self) -> bool {
        self.prefix
            .as_deref()
            .map(str::trim)
            .is_some_and(|prefix| !prefix.is_empty() && prefix != "-")
    }
}
