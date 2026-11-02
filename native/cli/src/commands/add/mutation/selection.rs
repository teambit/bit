//! Project the selected persisted identities into [`Projection`] without inventing new-component versions.
//!
//! Builds [`Workspace`] and [`WorkspaceConfig`] projections via [`prepare`], [`components`], and [`seed_environments`].
use super::super::projection::{self, Projection};
use bit_install::{config::WorkspaceConfig, model::WorkspaceComponent, workspace::Workspace};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Projects `identities` from `bitmap` and `context` into a [`Projection`] for component loading.
pub(super) fn prepare(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
    context: Value,
) -> io::Result<Projection> {
    let config =
        WorkspaceConfig::from_value(root.join("workspace.jsonc"), context["workspace"].clone())?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = Workspace::load_projected(root, &config, &core, bitmap)?;
    let expected = identities
        .iter()
        .map(|target| {
            let trimmed = target.trim();
            trimmed.rsplit_once('@').map_or(trimmed, |(base, _)| base.trim())
        })
        .filter(|target| !target.is_empty())
        .collect::<std::collections::HashSet<_>>();
    let selected = workspace.components
        .iter()
        .filter_map(|component| {
            let id = component.id.to_string_without_version();
            expected.contains(id.trim()).then(|| {
                json!({
                    "identity": id,
                    "rootDir": component.root_dir,
                    "mainFile": component.main_file,
                    "files": component.files,
                    "loadVersion": component.id.version.as_deref().map(str::trim).filter(|version| !version.is_empty()).unwrap_or("latest"),
                })
            })
        })
        .collect::<Vec<_>>();
    if selected.len() != expected.len() {
        return Err(io::Error::other("identity link selection changed"));
    }
    projection::prepare_loaded(root, bitmap, &selected, context, workspace)
}

/// Selects [`WorkspaceComponent`] entries from `projection` in the order of `identities`.
pub(super) fn components(
    projection: &Projection,
    identities: &[String],
) -> Vec<WorkspaceComponent> {
    let mut by_id = std::collections::HashMap::with_capacity(projection.workspace.components.len());
    for component in &projection.workspace.components {
        by_id.insert(
            component.id
                .to_string_without_version()
                .trim()
                .to_owned(),
            component,
        );
    }
    identities
        .iter()
        .map(|identity| {
            let trimmed = identity.trim();
            trimmed.rsplit_once('@').map_or(trimmed, |(base, _)| base.trim())
        })
        .filter(|identity| !identity.is_empty())
        .filter_map(|identity| by_id.get(identity).copied().cloned())
        .collect()
}

/// Seeds loaded component classes on `host` and resolves registered environment IDs onto `components` via [`extract_registered_env`].
pub(super) fn seed_environments(
    components: &mut [WorkspaceComponent],
    host: &crate::host::Host,
    captured: &[Value],
) -> io::Result<()> {
    let facts = host.call(
        "identityLinkFacts",
        &json!({"components":captured,"ids":components.iter().map(|component| &component.env_id).collect::<Vec<_>>()}),
    )?;
    for component in components {
        component.env_id = extract_registered_env(&facts, &component.env_id)
            .ok_or_else(|| io::Error::other("identity registered environment receipt"))?;
    }
    Ok(())
}

/// Extracts the registered environment ID for `env_id` from the `identityLinkFacts` response `facts`.
#[inline]
fn extract_registered_env(facts: &Value, env_id: &str) -> Option<String> {
    let entry = facts
        .get(env_id)
        .or_else(|| facts.get(env_id.trim()))?;
    entry
        .as_str()
        .or_else(|| {
            entry
                .as_object()
                .and_then(|object| {
                    object
                        .get("id")
                        .or_else(|| object.get("resolvedId"))
                })
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
