use super::super::wire::{Entry, Policy};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;

type Packages = Map<String, Value>;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    pub(super) state: State,
    pub(super) manual: [Packages; 3],
    pub(super) package_json: [Packages; 3],
    pub(super) resolved: HashMap<String, Resolved>,
    pub(super) self_identity: String,
    pub(super) environment: Environment,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct State {
    pub(super) packages: [Packages; 3],
    pub(super) components: [Vec<usize>; 3],
    pub(super) entries: Vec<Entry>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Resolved {
    pub(super) name: String,
    pub(super) component_identity: Option<String>,
    pub(super) concrete_version: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Environment {
    pub(super) policy: Packages,
    pub(super) workspace: Policy,
    pub(super) model_components: Vec<Entry>,
    pub(super) model_packages: Packages,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Output {
    pub(super) state: State,
    pub(super) added: [Vec<String>; 3],
    pub(super) missing: Vec<String>,
    pub(super) ignored_self: Vec<String>,
    pub(super) env_own: Vec<String>,
}
impl Output {
    pub(super) fn new(request: &Request) -> Self {
        Self {
            state: request.state.clone(),
            added: std::array::from_fn(|_| Vec::new()),
            missing: Vec::new(),
            ignored_self: Vec::new(),
            env_own: request.environment.policy
                .keys()
                .cloned()
                .collect(),
        }
    }
    pub(super) fn added(&mut self, field: usize, value: String) {
        if !self.added[field].contains(&value) {
            self.added[field].push(value);
        }
    }
}
pub(super) fn unversioned(value: &str) -> &str {
    let trimmed = value.trim();
    match trimmed.rfind('@') {
        Some(index) if index > 0 && !trimmed[index + 1..].contains('/') => {
            trimmed[..index].trim_end()
        }
        _ => trimmed,
    }
}
