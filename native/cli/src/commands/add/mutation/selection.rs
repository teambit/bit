//! Project the selected persisted identities without inventing new-component versions.
use super::super::projection::{self, Projection};
use bit_install::{config::WorkspaceConfig, model::WorkspaceComponent, workspace::Workspace};
use serde_json::{Value, json};
use std::{io, path::Path};

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
    let selected = workspace.components
        .iter()
        .filter(|component| {
            let id = component.id.to_string_without_version();
            identities.iter().any(|target| target.trim() == id)
        })
        .map(|component| {
            json!({
                "identity": component.id.to_string_without_version(),
                "rootDir": component.root_dir,
                "mainFile": component.main_file,
                "files": component.files,
                "loadVersion": component.id.version.as_deref().map(str::trim).filter(|version| !version.is_empty()).unwrap_or("latest"),
            })
        })
        .collect::<Vec<_>>();
    if selected.len() != identities.len() {
        return Err(io::Error::other("identity link selection changed"));
    }
    projection::prepare_loaded(root, bitmap, &selected, context, workspace)
}

pub(super) fn components(
    projection: &Projection,
    identities: &[String],
) -> Vec<WorkspaceComponent> {
    identities
        .iter()
        .map(|identity| identity.trim())
        .filter(|identity| !identity.is_empty())
        .filter_map(|identity| {
            projection.workspace.components
                .iter()
                .find(|component| component.id.to_string_without_version().trim() == identity)
                .cloned()
        })
        .collect()
}

/// Seed actual loaded classes before resolving registered environment identities.
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
