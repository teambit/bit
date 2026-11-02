//! The initial codemod link precedes policy aggregation and manifest component loads.
//!
//! Used when `linkCoreAspects` runs before calculating component manifests.
//! [`calculate_linked`] loads [`Session`] and [`Loaded`] workspace components and links codemods into [`Calculated`].
use super::{Calculated, calculate, resolve};
use crate::{
    command::session::{Loaded, Session},
    model::DependencyMap,
};
use std::io;

/// Phase identifier (`"linking"`) passed when loading [`Session`] components for [`calculate_linked`].
const LINKING_PHASE: &str = "linking";

/// Performs initial codemod linking (`calculateLinks`) via [`resolve`] before calculating workspace manifests via [`calculate`].
pub(in crate::command) async fn calculate_linked(
    session: &Session<'_>,
    loaded: &Loaded,
    linked_root_deps: &DependencyMap,
) -> io::Result<Calculated> {
    if [&session.root, &loaded.workspace.scope_path]
        .into_iter()
        .any(|path| {
            path.as_os_str()
                .as_encoded_bytes()
                .iter()
                .all(u8::is_ascii_whitespace)
        })
    {
        return Err(io::Error::other("workspace or scope path is empty"));
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
