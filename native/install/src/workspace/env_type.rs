//! `isUsingAspectEnv`: components whose env descriptor (the `teambit.envs/envs`
//! data stored in their Version) has type `aspect` export their types from the
//! generated `package.json`. A component that was never tagged has no descriptor
//! yet, so the core aspect envs stay a fallback.

#[cfg(test)]
mod tests;

use super::scope_model::ScopeObjects;
use crate::model::WorkspaceComponent;
use std::io;

/// The env ids whose components are aspects: `core` plus the envs of
/// components whose stored descriptor says `aspect`.
pub fn aspect_env_ids(
    components: &[WorkspaceComponent],
    objects: &ScopeObjects,
    core: &[&str],
) -> io::Result<Vec<String>> {
    let mut ids: Vec<String> = core
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect();
    for component in components {
        let env_id = component.env_id.trim();
        if env_id.is_empty()
            || ids
                .iter()
                .any(|existing| existing == env_id)
        {
            continue;
        }
        let uses_aspect_env =
            objects.component(&component.id)?.is_some_and(|model| model.uses_aspect_env());
        if uses_aspect_env {
            ids.push(env_id.to_owned());
        }
    }
    Ok(ids)
}
