//! `findFirstEnv` of `calculateEnvId`: without an env in `teambit.envs/envs`, the
//! first configured aspect that is an env component — one with an `env.jsonc` or
//! `env.json` (`hasEnvManifest`) or whose own env is `teambit.envs/env` — is the
//! component's env. An aspect that is not in the workspace is read from the
//! scope at its configured version, or at its head without one.

#[cfg(test)]
mod tests;

use super::{DEFAULT_ENV, aspects::CORE_ENVS, scope_model::ScopeObjects};
use crate::{
    config::{ENVS_ASPECT, aspect_id_without_version},
    model::WorkspaceComponent,
};
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
        let trimmed = id.trim();
        let without = aspect_id_without_version(trimmed);
        if without.is_empty()
            || without == ENVS_ASPECT
            || core_aspect_ids
                .iter()
                .any(|core| core.trim() == without)
        {
            continue;
        }
        if CORE_ENVS.contains(&without) || is_env_component(trimmed, envs, objects)? {
            return Ok(Some(trimmed.to_owned()));
        }
    }
    Ok(None)
}

/// `teambit.envs/envs` names the env, or the default env is configured itself.
fn has_configured_env(component: &WorkspaceComponent) -> bool {
    component.config
        .keys()
        .any(|key| aspect_id_without_version(key) == DEFAULT_ENV)
        || component.config
            .iter()
            .find_map(|(key, value)| {
                (aspect_id_without_version(key) == ENVS_ASPECT).then_some(value)
            })
            .and_then(|config| config.get("env"))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|env| !env.trim().is_empty())
}

fn is_env_component(id: &str, envs: &[(String, bool)], objects: &ScopeObjects) -> io::Result<bool> {
    let without = aspect_id_without_version(id);
    if let Some((_, is_env)) = envs
        .iter()
        .find(|(component, _)| component == without)
    {
        return Ok(*is_env);
    }
    let Some(model) = objects.aspect(id)? else { return Ok(false) };
    Ok(model.has_env_manifest() || model.uses_env_of_envs())
}
