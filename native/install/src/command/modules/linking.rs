//! The links around the engine run: `calculateLinkedDeps`, `linkCodemods` and
//! `syncCoreAspectLinksForEnvs`.

use super::super::{
    calculate::Calculated,
    session::{Loaded, Session},
};
use crate::{
    links::{self, ComponentLinkOptions, LinkOptions},
    model::DependencyMap,
    workspace::{ScopeObjects, aspect_env_ids},
};
use std::{io, time::Instant};

const LINKING: &str = "linking components";

/// Core envs of type `aspect`; the stored env descriptors of the components
/// add the custom ones (`isUsingAspectEnv`).
const ASPECT_ENVS: [&str; 3] = [
    "teambit.harmony/aspect",
    "teambit.harmony/envs/core-aspect-env",
    "teambit.harmony/envs/core-aspect-env-jest",
];

/// The `link:` dependencies of the root manifest (`calculateLinkedDeps`).
pub fn root_links(session: &Session<'_>, loaded: &Loaded) -> io::Result<DependencyMap> {
    // `calculateLinks` loads the components (`getComponentsDirectory`) first.
    session.loading(loaded);
    session.output.status(LINKING);
    let started = Instant::now();
    let config = &loaded.config.dependency_resolver;
    let options = LinkOptions {
        link_teambit_bit: true,
        link_core_aspects: config.link_core_aspects(),
        link_nested_deps_in_nm: !config.has_root_components(),
    };
    let links =
        links::linked_root_deps(&session.root, session.info, &loaded.components(), &options)?;
    if loaded.engine.layout.enable_global_virtual_store {
        links::link_core_aspects_to_hoisted_store(&session.root, &links)?;
    }
    session.output.success(LINKING, Some(started));
    Ok(links)
}

/// The first `linkCodemods`, before the engine runs.
pub async fn link_components_timed(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
) -> io::Result<()> {
    link_components(session, loaded, calculated).await
}

/// `linkCodemods`: every component as a package in `node_modules`.
pub async fn link_components(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
) -> io::Result<()> {
    let config = &loaded.config.dependency_resolver;
    let root_components_dir = loaded.config.root_components_path(&session.root);
    let cloud_domain = loaded.effective.cloud_domain();
    let aspect_env_ids = aspect_env_ids(
        &calculated.components,
        &ScopeObjects::new(&loaded.workspace.scope_path),
        &ASPECT_ENVS,
    )?;
    let options = ComponentLinkOptions {
        has_root_components: config.has_root_components(),
        root_components_dir: &root_components_dir,
        dependencies: &calculated.dependencies,
        cloud_domain: &cloud_domain,
        windows: cfg!(windows),
        aspect_env_ids: &aspect_env_ids,
    };
    links::link_components(&session.root, &calculated.components, session.host, &options).await?;
    Ok(())
}

/// `syncCoreAspectLinksForEnvs`, only for workspaces that author the core aspects.
pub fn sync_core_aspects(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
) -> io::Result<()> {
    if loaded.config.dependency_resolver.link_core_aspects() {
        return Ok(());
    }
    let global_virtual_store = loaded.engine.layout.enable_global_virtual_store;
    let warning = links::sync_core_aspect_links_for_envs(
        &session.root,
        session.info,
        &calculated.components,
        global_virtual_store,
    )?;
    if let Some(warning) = warning {
        session.output.warning(&warning);
    }
    Ok(())
}
