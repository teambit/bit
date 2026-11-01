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
        let mut env_own = Vec::with_capacity(request.environment.policy.len());
        for key in request.environment.policy
            .keys()
            .map(String::as_str)
            .map(str::trim)
        {
            if !key.is_empty()
                && !env_own
                    .iter()
                    .any(|existing| existing == key)
            {
                env_own.push(key.to_owned());
            }
        }
        Self {
            state: request.state.clone(),
            added: std::array::from_fn(|_| Vec::new()),
            missing: Vec::new(),
            ignored_self: Vec::new(),
            env_own,
        }
    }
    pub(super) fn added(&mut self, field: usize, value: String) {
        let trimmed = value.trim();
        if trimmed.is_empty()
            || self.added[field]
                .iter()
                .any(|existing| existing == trimmed)
        {
            return;
        }
        let value = if trimmed.len() == value.len() { value } else { trimmed.to_owned() };
        self.added[field].push(value);
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
