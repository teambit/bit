//! Native dependency facts before linking and after the actual manifest class load.
use super::{dependency_options, workspace_aspects, workspace_policy};
use crate::{
    command::session::{Loaded, Session},
    dependencies,
    model::{ComponentDependencies, EnvPolicy, PolicyEntry, WorkspaceComponent},
    policy,
    workspace::ScopeObjects,
};
use indexmap::IndexMap;
use std::io;

/// The env policies, the workspace policy and the components' dependencies.
pub(super) struct Resolved {
    pub(super) env_policies: IndexMap<String, EnvPolicy>,
    pub(super) workspace_policy: Vec<PolicyEntry>,
    pub(super) dependencies: IndexMap<String, ComponentDependencies>,
}

pub(super) async fn resolve(
    session: &Session<'_>,
    loaded: &Loaded,
    components: &[WorkspaceComponent],
) -> io::Result<Resolved> {
    // `InstallMain.install` loads the components before the manifests; the envs that
    // registers are the only ones the env requests see until the package manager ran.
    session.host.prepare_install(&workspace_aspects(session, loaded)).await?;
    resolve_initialized(session, loaded, components, false).await
}

pub(super) async fn resolve_initialized(
    session: &Session<'_>,
    loaded: &Loaded,
    components: &[WorkspaceComponent],
    cache_initialized: bool,
) -> io::Result<Resolved> {
    let objects = ScopeObjects::new(&loaded.workspace.scope_path);
    let env_policies = policy::load_env_policies(&session.root, components, session.host).await?;
    let workspace_policy = workspace_policy(loaded)?;
    let mut options = dependency_options(session, loaded, components)?;
    options.cache_initialized |= cache_initialized;
    options.policy_slots =
        policy::slots::registry(components, &session.info.core_aspects, &objects, session.host)
            .await?;
    let dependencies = dependencies::compute(
        &session.root,
        components,
        &workspace_policy,
        &env_policies,
        loaded.workspace.root_package_json.as_ref(),
        &options,
        session.host,
    )
    .await?;
    Ok(Resolved { env_policies, workspace_policy, dependencies })
}
