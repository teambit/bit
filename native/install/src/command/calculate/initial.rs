//! The initial codemod link precedes policy aggregation and manifest component loads.
use super::{Calculated, calculate, resolve};
use crate::{
    command::session::{Loaded, Session},
    model::DependencyMap,
};
use std::io;

const LINKING_PHASE: &str = "linking";

/// The initial `calculateLinks` performs codemod linking before calculating manifests.
pub(in crate::command) async fn calculate_linked(
    session: &Session<'_>,
    loaded: &Loaded,
    linked_root_deps: &DependencyMap,
) -> io::Result<Calculated> {
    if session.root.as_os_str().is_empty() || loaded.workspace.scope_path.as_os_str().is_empty() {
        return Err(io::Error::other("workspace root path is empty"));
    }
    let components =
        crate::command::session::installation_components::load(session, loaded, LINKING_PHASE)
            .await?;
    let resolved = resolve(session, loaded, &components).await?;
    crate::command::modules::linking::link_components(
        session,
        loaded,
        &resolved.dependencies,
        &components,
    )
    .await?;
    calculate(session, loaded, linked_root_deps).await
}
