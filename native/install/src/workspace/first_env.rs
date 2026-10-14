//! `findFirstEnv` of `calculateEnvId`: without an env in `teambit.envs/envs`, the
//! first configured aspect that is an env component — one with an `env.jsonc` or
//! whose own env is `teambit.envs/env` — is the component's env.

use super::{DEFAULT_ENV, ENV_OF_ENVS, aspects::CORE_ENVS, scope_model::ScopeObjects};
use crate::{
    config::{ENVS_ASPECT, aspect_id_without_version},
    model::{ComponentId, WorkspaceComponent},
};
use serde_json::Value;
use std::io;

/// Set the env of components whose env comes from an env aspect configured on them.
pub fn resolve(
    components: &mut [WorkspaceComponent],
    objects: &ScopeObjects,
    core_aspect_ids: &[String],
) -> io::Result<()> {
    let envs: Vec<(String, bool)> = components
        .iter()
        .map(|component| (component.id.to_string_without_version(), component.is_env))
        .collect();
    for component in components.iter_mut() {
        if component.env_id != DEFAULT_ENV || has_configured_env(component) {
            continue;
        }
        if let Some(env) = first_env(component, &envs, objects, core_aspect_ids)? {
            component.env_id = env;
        }
    }
    Ok(())
}

/// The first configured aspect that is an env; core aspects never are.
fn first_env(
    component: &WorkspaceComponent,
    envs: &[(String, bool)],
    objects: &ScopeObjects,
    core_aspect_ids: &[String],
) -> io::Result<Option<String>> {
    for id in component.config.keys() {
        let without = aspect_id_without_version(id);
        if without == ENVS_ASPECT
            || core_aspect_ids
                .iter()
                .any(|core| core == without)
        {
            continue;
        }
        if CORE_ENVS.contains(&without) || is_env_component(id, envs, objects)? {
            return Ok(Some(id.clone()));
        }
    }
    Ok(None)
}

/// `teambit.envs/envs` names the env, or the default env is configured itself.
fn has_configured_env(component: &WorkspaceComponent) -> bool {
    component.config.contains_key(DEFAULT_ENV)
        || component.config
            .get(ENVS_ASPECT)
            .and_then(|config| config.get("env"))
            .is_some()
}

fn is_env_component(id: &str, envs: &[(String, bool)], objects: &ScopeObjects) -> io::Result<bool> {
    let without = aspect_id_without_version(id);
    if let Some((_, is_env)) = envs
        .iter()
        .find(|(component, _)| component == without)
    {
        return Ok(*is_env);
    }
    let (name, version) = without
        .split_once('/')
        .map_or((without, None), |(scope, name)| (name, Some(scope)));
    let Some(scope) = version else { return Ok(false) };
    let component_id = ComponentId {
        scope: Some(scope.to_owned()),
        default_scope: None,
        name: name.to_owned(),
        version: id.split_once('@').map(|(_, version)| version.to_owned()),
    };
    let Some(model) = objects.component(&component_id)? else { return Ok(false) };
    Ok(model.extensions.iter().any(uses_env_env))
}

/// The Version's extensions configure `teambit.envs/env`, or `teambit.envs/envs` sets it as env.
fn uses_env_env(extension: &Value) -> bool {
    let name = extension
        .get("name")
        .or_else(|| {
            extension
                .get("extensionId")
                .and_then(|id| id.get("name"))
        })
        .and_then(Value::as_str)
        .unwrap_or_default();
    aspect_id_without_version(name) == ENV_OF_ENVS
        || (name == ENVS_ASPECT
            && [extension.get("config"), extension.get("data")]
                .into_iter()
                .flatten()
                .any(|data| data.get("env").and_then(Value::as_str) == Some(ENV_OF_ENVS)))
}

#[cfg(test)]
mod tests;
