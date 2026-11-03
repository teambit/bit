//! Project the retained add `.bitmap` ([`Projection`]) into the existing native [`Workspace`] component loader.
//!
//! Exposes [`prepare`] to construct [`WorkspaceComponent`] rows from staged `.bitmap` updates.
use bit_install::{config::WorkspaceConfig, model::WorkspaceComponent, workspace::Workspace};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Projected [`Workspace`] state and selected component entries for a staged `.bitmap`.
pub(super) struct Projection {
    pub workspace: Workspace,
    pub context: Value,
    pub selected: Vec<Value>,
    pub components: Vec<Value>,
    pub load_error: Option<String>,
}

impl Projection {
    /// Returns the projected component entries corresponding to `self.selected`.
    #[inline]
    pub(super) fn loading_components(&self) -> Vec<Value> {
        self.selected
            .iter()
            .filter_map(|target| {
                let target_id = row_identity(target)?;
                self.components
                    .iter()
                    .find(|component| row_identity(component) == Some(target_id))
                    .cloned()
            })
            .collect()
    }
}

/// Loads the projected [`Workspace`] from `bitmap` and `context` and constructs a [`Projection`] via [`prepare_loaded`].
pub(super) fn prepare(
    root: &Path,
    bitmap: &Value,
    added: &[Value],
    context: Value,
) -> io::Result<Projection> {
    let config =
        WorkspaceConfig::from_value(root.join("workspace.jsonc"), context["workspace"].clone())?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .map_err(io::Error::other)?;
    let workspace = Workspace::load_projected(root, &config, &core, bitmap)?;
    prepare_loaded(root, bitmap, added, context, workspace)
}

/// Builds a [`Projection`] from an already-loaded [`Workspace`], `bitmap`, `added` rows, and `context`.
pub(super) fn prepare_loaded(
    root: &Path,
    bitmap: &Value,
    added: &[Value],
    mut context: Value,
    workspace: Workspace,
) -> io::Result<Projection> {
    let previous = context["targets"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut targets = workspace.components
        .iter()
        .map(|component| target(component, bitmap, added, &previous))
        .collect::<Vec<_>>();
    let load_error = controls(root, &mut targets, added)?;
    let selected = select(added, &targets);
    let components = components(&workspace, added);
    context["targets"] = json!(targets);
    Ok(Projection { workspace, context, selected, components, load_error })
}

/// Builds a `trackingContext` target entry for `component` from `bitmap`, `added`, and `previous` rows.
fn target(
    component: &WorkspaceComponent,
    bitmap: &Value,
    added: &[Value],
    previous: &[Value],
) -> Value {
    let identity = component.id.to_string_without_version();
    let mut target = previous
        .iter()
        .find(|target| row_identity(target) == Some(identity.as_str()))
        .cloned()
        .unwrap_or_else(|| json!({"config":null,"packageJson":null}));
    target["identity"] = json!(identity);
    target["directory"] = json!(component.root_dir);
    target["version"] = json!(component.id.version.as_deref().unwrap_or_default());
    tracking_version(&mut target, added);
    target["mainFile"] = json!(component.main_file);
    target["scoped"] = json!(component.id.scope.is_some());
    target["localOnly"] = json!(false);
    target["softTagged"] = json!(false);
    target["locallyRemoved"] = json!(false);
    target["componentConfig"] = bitmap
        .as_object()
        .and_then(|entries| {
            entries
                .values()
                .find(|entry| {
                    entry["rootDir"].as_str().map(str::trim) == Some(component.root_dir.trim())
                })
        })
        .and_then(|entry| entry.get("config"))
        .cloned()
        .unwrap_or(Value::Null);
    target
}

/// Reads `component.json` and `package.json` control files under `root` for `targets` and `added` rows.
fn controls(root: &Path, targets: &mut [Value], added: &[Value]) -> io::Result<Option<String>> {
    let mut error = None;
    for target in targets {
        let directory = target["directory"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| io::Error::other("tracking target directory"))?;
        let component_dir = root.join(directory);
        let config = optional_json(&component_dir.join("component.json"))?;
        if malformed_selected(&config, target, added) {
            error = Some("Cannot read properties of undefined (reading 'scope')".to_owned());
        }
        target["config"] = component_config(config);
        target["packageJson"] = optional_json(&component_dir.join("package.json"))?;
    }
    Ok(error)
}
#[inline]
fn malformed_selected(config: &Value, target: &Value, added: &[Value]) -> bool {
    let target_id = row_identity(target);
    !config.is_null()
        && config.get("componentId").is_none()
        && added
            .iter()
            .any(|row| {
                row_identity(row) == target_id
                    && (row["rootDir"].is_string() || row["directory"].is_string())
            })
}
fn select(added: &[Value], targets: &[Value]) -> Vec<Value> {
    added
        .iter()
        .filter(|row| {
            (row["rootDir"].is_string() || row["directory"].is_string())
                && row["files"]
                    .as_array()
                    .is_some_and(|files| !files.is_empty())
        })
        .filter_map(|row| {
            let row_id = row_identity(row)?;
            targets
                .iter()
                .find(|target| row_identity(target) == Some(row_id))
                .cloned()
        })
        .collect()
}
fn components(workspace: &Workspace, added: &[Value]) -> Vec<Value> {
    workspace.components.iter().map(|component|{
        let mut row=json!({"identity":component.id.to_string_without_version(),"directory":component.root_dir,"mainFile":component.main_file,"files":component.files.iter().map(|file|json!({"relativePath":file,"name":file.rsplit('/').next().unwrap_or(file),"test":false})).collect::<Vec<_>>()});
        tracking_version(&mut row,added);
        row
    }).collect()
}
#[inline]
fn tracking_version(row: &mut Value, added: &[Value]) {
    let Some(load_version) = row_identity(row)
        .and_then(|row_id| {
            added
                .iter()
                .find(|added| row_identity(added) == Some(row_id))
                .map(|added| added["loadVersion"].clone())
        })
    else {
        return;
    };
    row["trackingVersion"] = load_version;
}
#[inline]
fn row_identity(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .or_else(|| {
            row["id"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
        })
        .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
        .filter(|id| !id.is_empty())
}
#[inline]
fn optional_json(path: &Path) -> io::Result<Value> {
    match std::fs::read(path) {
        Ok(bytes) => bit_object_import::parse_jsonc(&bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}
#[inline]
fn component_config(value: Value) -> Value {
    if value.is_null() {
        return value;
    }
    let mut result =
        json!({"extensions":value.get("extensions").cloned().unwrap_or_else(||json!({}))});
    if let Some(propagate) = value.get("propagate") {
        result["propagate"] = propagate.clone();
    }
    result
}
