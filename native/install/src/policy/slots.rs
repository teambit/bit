//! Dependency policies aspects register through `registerDependenciesPolicies`
//! (the "slots" layer of `mergeVariantPolicies`).
//!
//! Queries the [`Host`] only for non-core configured aspects that may register slot policies ([`Registration`]).

#[cfg(test)]
mod tests;

use super::entries::{self, VariantOptions, merge};
use crate::{
    host::{CoreAspect, Host},
    model::{PolicyEntry, WorkspaceComponent},
    policy::is_core_env,
    workspace::ScopeObjects,
};
use serde_json::Value;
use std::io;

/// One registration: the registering aspect ID and its `VariantPolicyConfigObject`.
pub type Registration = (String, Value);

/// The aspects Bit treats as core besides the manifest's core aspects (`teambit.harmony/bit` and `teambit.harmony/config`).
const RESERVED: [&str; 2] = ["teambit.harmony/bit", "teambit.harmony/config"];

/// Aspect ID (`teambit.envs/env`) of environment plugins (`*.bit-env.*`).
const ENV_OF_ENVS: &str = "teambit.envs/env";

/// The registrations of the aspects the components configure. Core aspects never
/// register a dependency policy, so only the remaining configured aspects can, and the
/// host is asked only when a component configures one. `objects` tells whether an env
/// that is not in the workspace is an env plugin.
pub async fn registry(
    components: &[WorkspaceComponent],
    core_aspects: &[CoreAspect],
    objects: &ScopeObjects,
    host: &dyn Host,
) -> io::Result<Vec<Registration>> {
    let candidates = candidates(components, core_aspects, objects)?;
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    Ok(host
        .dependency_policies(&candidates)
        .await?
        .as_ref()
        .map_or_else(Vec::new, parse))
}

/// Configured extension ids that are not core aspects and whose loading may run a
/// provider. The component's env is one unless it is an env plugin: an env aspect's
/// provider can call `registerDependenciesPolicies` too, and the registration applies
/// to the components that configure the env.
pub fn candidates(
    components: &[WorkspaceComponent],
    core_aspects: &[CoreAspect],
    objects: &ScopeObjects,
) -> io::Result<Vec<String>> {
    let mut ids: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for component in components {
        for id in component.config.keys() {
            let trimmed = id.trim();
            if !trimmed.is_empty()
                && !seen.contains(trimmed)
                && may_register(trimmed, component, components, core_aspects, objects)?
            {
                seen.insert(trimmed);
                ids.push(trimmed.to_owned());
            }
        }
    }
    Ok(ids)
}

/// Return `true` when `id` is neither a core aspect nor an environment plugin (`*.bit-env.*`) for [`WorkspaceComponent`].
#[inline]
fn may_register(
    id: &str,
    component: &WorkspaceComponent,
    components: &[WorkspaceComponent],
    core_aspects: &[CoreAspect],
    objects: &ScopeObjects,
) -> io::Result<bool> {
    let bare = super::split_version(id).0;
    if is_core(bare, core_aspects) {
        return Ok(false);
    }
    if bare != super::split_version(&component.env_id).0 {
        return Ok(true);
    }
    Ok(!is_env_plugin(id, components, objects)?)
}

/// The env's own env is [`ENV_OF_ENVS`] (`teambit.envs/env`): a workspace env by its loaded env, any
/// other by its [`ScopeObjects`]. An env the scope does not hold is loaded to find out.
#[inline]
fn is_env_plugin(
    env_id: &str,
    components: &[WorkspaceComponent],
    objects: &ScopeObjects,
) -> io::Result<bool> {
    let bare = super::split_version(env_id).0;
    if let Some(env) = components
        .iter()
        .find(|component| component.id.to_string_without_version() == bare)
    {
        return Ok(super::split_version(&env.env_id).0 == ENV_OF_ENVS);
    }
    Ok(objects.aspect(env_id)?.is_some_and(|model| model.uses_env_of_envs()))
}

/// The component configures an extension id that is not a core aspect. On a core env,
/// that is the same as [`candidates`] being non-empty, without classifying the env.
#[must_use]
#[inline]
pub fn configures_non_core(component: &WorkspaceComponent, core_aspects: &[CoreAspect]) -> bool {
    component.config
        .keys()
        .any(|id| !is_core(super::split_version(id).0, core_aspects))
}

/// A Bit core aspect, a core env or an id Bit reserves.
#[must_use]
#[inline]
pub fn is_core(id: &str, core_aspects: &[CoreAspect]) -> bool {
    let id = id.trim();
    let bare = super::split_version(id).0;
    RESERVED.contains(&id)
        || RESERVED.contains(&bare)
        || is_core_env(id)
        || core_aspects
            .iter()
            .any(|aspect| {
                let aspect_id = aspect.id.trim();
                aspect_id == id || super::split_version(aspect_id).0 == bare
            })
}

/// `[[registrar, policy], ...]` as the host returns `policiesRegistry.toArray()`.
#[inline]
fn parse(registry: &Value) -> Vec<Registration> {
    registry
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tuple| {
            let registrar = tuple
                .get(0)?
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())?
                .to_owned();
            Some((registrar, tuple.get(1)?.clone()))
        })
        .collect()
}

/// The slots layer of one component: for each configured extension id, in order,
/// the first registration whose registrar equals it or contains it.
#[must_use]
pub fn component_slots(
    component: &WorkspaceComponent,
    registry: &[Registration],
) -> Vec<PolicyEntry> {
    let options = VariantOptions { source: Some("slots"), ..VariantOptions::default() };
    let mut slots: Vec<PolicyEntry> = Vec::new();
    for id in component.config.keys() {
        let trimmed = id.trim();
        let bare = super::split_version(trimmed).0;
        if bare.is_empty() {
            continue;
        }
        let registered = registry
            .iter()
            .find(|(registrar, _)| {
                let reg = registrar.trim();
                reg == trimmed
                    || super::split_version(reg).0 == bare
                    || reg.contains(trimmed)
                    || reg.contains(bare)
            });
        if let Some((_, policy)) = registered.filter(|(_, policy)| entries::truthy(policy)) {
            slots = merge(vec![slots, entries::from_variant_config(policy, &options)]);
        }
    }
    slots
}
