//! Dependency policies aspects register through `registerDependenciesPolicies`
//! (the "slots" layer of `mergeVariantPolicies`).

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

/// One registration: the registering aspect id and its `VariantPolicyConfigObject`.
pub type Registration = (String, Value);

/// The aspects Bit treats as core besides the manifest's core aspects.
const RESERVED: [&str; 2] = ["teambit.harmony/bit", "teambit.harmony/config"];

/// The env of env plugins (`*.bit-env.*`), which are not loaded through a provider.
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
    let Some(registry) = host.dependency_policies(&candidates).await? else {
        return Ok(Vec::new());
    };
    Ok(parse(&registry))
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
    for component in components {
        for id in component.config.keys() {
            if !ids.contains(id) && may_register(id, component, components, core_aspects, objects)?
            {
                ids.push(id.clone());
            }
        }
    }
    Ok(ids)
}

/// A configured id that is not a core aspect, nor the component's env when that is
/// an env plugin.
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

/// The env's own env is `teambit.envs/env`: a workspace env by its loaded env, any
/// other by its scope objects. An env the scope does not hold is loaded to find out.
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
pub fn configures_non_core(component: &WorkspaceComponent, core_aspects: &[CoreAspect]) -> bool {
    component.config
        .keys()
        .any(|id| !is_core(super::split_version(id).0, core_aspects))
}

/// A Bit core aspect, a core env or an id Bit reserves.
#[must_use]
pub fn is_core(id: &str, core_aspects: &[CoreAspect]) -> bool {
    RESERVED.contains(&id)
        || is_core_env(id)
        || core_aspects
            .iter()
            .any(|aspect| aspect.id == id)
}

/// `[[registrar, policy], ...]` as the host returns `policiesRegistry.toArray()`.
fn parse(registry: &Value) -> Vec<Registration> {
    registry
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tuple| {
            let registrar = tuple.get(0)?.as_str()?.to_owned();
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
        let registered = registry
            .iter()
            .find(|(registrar, _)| registrar == id || registrar.contains(id.as_str()));
        if let Some((_, policy)) = registered.filter(|(_, policy)| entries::truthy(policy)) {
            slots = merge(vec![slots, entries::from_variant_config(policy, &options)]);
        }
    }
    slots
}
