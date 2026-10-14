//! Dependency policies aspects register through `registerDependenciesPolicies`
//! (the "slots" layer of `mergeVariantPolicies`).

use super::entries::{self, VariantOptions, merge};
use crate::{
    host::{CoreAspect, Host},
    model::{PolicyEntry, WorkspaceComponent},
    policy::is_core_env,
};
use serde_json::Value;
use std::io;

/// One registration: the registering aspect id and its `VariantPolicyConfigObject`.
pub type Registration = (String, Value);

/// The aspects Bit treats as core besides the manifest's core aspects.
const RESERVED: [&str; 2] = ["teambit.harmony/bit", "teambit.harmony/config"];

/// The registrations of the aspects the components configure. Core aspects never
/// register a dependency policy, and an env contributes its policy through
/// `getDependencies()`, so only the remaining configured aspects can, and the host is
/// asked only when a component configures one.
pub async fn registry(
    components: &[WorkspaceComponent],
    core_aspects: &[CoreAspect],
    host: &dyn Host,
) -> io::Result<Vec<Registration>> {
    let candidates = candidates(components, core_aspects);
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    let Some(registry) = host.dependency_policies(&candidates).await? else {
        return Ok(Vec::new());
    };
    Ok(parse(&registry))
}

/// Configured extension ids that are neither core aspects nor the component's env.
#[must_use]
pub fn candidates(components: &[WorkspaceComponent], core_aspects: &[CoreAspect]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for component in components {
        let env = super::split_version(&component.env_id).0;
        for id in component.config.keys() {
            let bare = super::split_version(id).0;
            if !is_core(bare, core_aspects) && bare != env && !ids.contains(id) {
                ids.push(id.clone());
            }
        }
    }
    ids
}

fn is_core(id: &str, core_aspects: &[CoreAspect]) -> bool {
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

#[cfg(test)]
mod tests;
