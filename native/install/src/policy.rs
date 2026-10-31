//! Workspace, variant and env dependency policies.

pub mod entries;
pub mod env;
pub mod load;
pub mod overrides;
pub mod scope;
pub mod slots;
#[cfg(test)]
pub(crate) mod tests;

pub use entries::{VariantOptions, merge};
pub use load::{CORE_ENVS, EnvJsoncReader, is_core_env, load_env_policies, split_version};

use crate::{
    config::DependencyResolverConfig,
    model::{EnvPolicy, Manifest, PolicyEntry, WorkspaceComponent},
};
use serde_json::Value;

/// The `dependency-resolver` aspect id.
pub const DEPENDENCY_RESOLVER: &str = "teambit.dependencies/dependency-resolver";

/// The workspace policy (`getWorkspacePolicy`): `workspace.jsonc`, overridden by the
/// root `package.json`, overridden by the merge-config file's policy.
#[must_use]
pub fn workspace_policy(
    config: &DependencyResolverConfig,
    root_package_json: Option<&Manifest>,
    merge_config_policy: Option<&Value>,
) -> Vec<PolicyEntry> {
    let from_config = entries::from_workspace_config(&config.policy);
    let from_package_json = root_package_json.map(entries::from_package_json).unwrap_or_default();
    let from_merge_config =
        merge_config_policy.map(entries::from_workspace_config).unwrap_or_default();
    merge(vec![from_config, merge(vec![from_package_json, from_merge_config])])
}

/// The merged policy of a component (`mergeVariantPolicies`): its env's policy, the
/// env's policy for itself when the component is an env, the policies of the aspects
/// it configures (`registerDependenciesPolicies`), then the component's own
/// `dependency-resolver` config policy.
#[must_use]
pub fn component_policy(
    component: &WorkspaceComponent,
    env_policy: &EnvPolicy,
    own_env_policy: Option<&EnvPolicy>,
    registry: &[slots::Registration],
) -> Vec<PolicyEntry> {
    let config = component.config
        .get(DEPENDENCY_RESOLVER)
        .or_else(|| {
            component.config
                .iter()
                .find_map(|(key, value)| {
                    (crate::config::aspect_id_without_version(key) == DEPENDENCY_RESOLVER)
                        .then_some(value)
                })
        })
        .and_then(|config| config.get("policy"))
        .map(|policy| {
            entries::from_variant_config(
                policy,
                &VariantOptions { source: Some("config"), ..VariantOptions::default() },
            )
        })
        .unwrap_or_default();
    let own = own_env_policy.map(|policy| policy.self_policy.clone()).unwrap_or_default();
    let slots = slots::component_slots(component, registry);
    merge(vec![env_policy.component.clone(), own, slots, config])
}

/// `toManifest()` of a workspace policy: `[dependencies, peerDependencies]` with
/// snap versions converted to semver.
#[must_use]
pub fn workspace_manifest(policy: &[PolicyEntry]) -> [indexmap::IndexMap<String, String>; 2] {
    let mut manifest: [indexmap::IndexMap<String, String>; 2] = Default::default();
    for entry in policy {
        let index = usize::from(entry.lifecycle == crate::model::Lifecycle::Peer);
        manifest[index].insert(entry.name.clone(), scope::snap_to_semver(&entry.version));
    }
    manifest
}
